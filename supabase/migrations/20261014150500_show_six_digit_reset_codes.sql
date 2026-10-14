-- Let approved admins retrieve active six-digit reset codes in the dashboard.
-- Direct table access remains disabled; codes are returned only by this
-- authenticated-admin-only RPC and expire after 30 minutes.

UPDATE public.password_reset_requests
SET status = 'pending',
    request_code = '',
    approved_at = NULL,
    approved_by = NULL,
    expires_at = now() + interval '24 hours',
    attempt_count = 0
WHERE status = 'approved';

CREATE OR REPLACE FUNCTION public.get_admin_password_reset_requests()
RETURNS TABLE(
    id bigint,
    user_id bigint,
    username text,
    request_code text,
    status text,
    created_at timestamp with time zone,
    expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.is_admin_user() THEN
        RAISE EXCEPTION 'Nur Administratoren dürfen Passwort-Reset-Codes ansehen';
    END IF;

    RETURN QUERY
    SELECT request.id,
           request.user_id,
           request.username,
           CASE
               WHEN request.status = 'approved' AND request.expires_at > now()
                   THEN request.request_code
               ELSE ''
           END,
           request.status,
           request.created_at,
           request.expires_at
    FROM public.password_reset_requests AS request
    ORDER BY request.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_password_reset(
    requested_id bigint,
    requested_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.is_admin_user()
       OR requested_code IS NULL
       OR requested_code !~ '^[0-9]{6}$' THEN
        RETURN false;
    END IF;

    UPDATE public.password_reset_requests AS request
    SET status = 'approved',
        request_code = requested_code,
        approved_at = now(),
        approved_by = (
            SELECT account.username
            FROM public.app_users AS account
            WHERE account.auth_user_id = auth.uid()
              AND account.approved = true
              AND account.is_admin = true
        ),
        expires_at = now() + interval '30 minutes',
        attempt_count = 0,
        used_at = NULL,
        completed_at = NULL
    WHERE request.id = requested_id
      AND request.status = 'pending';

    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_password_reset(requested_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public.is_admin_user() THEN
        RETURN false;
    END IF;

    UPDATE public.password_reset_requests AS request
    SET status = 'pending',
        request_code = '',
        approved_at = NULL,
        approved_by = NULL,
        expires_at = now() + interval '24 hours',
        attempt_count = 0
    WHERE request.id = requested_id
      AND request.status = 'approved';

    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_password_reset(
    requested_username text,
    requested_code text,
    new_password text,
    requested_id bigint
)
RETURNS TABLE(success boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    target_user_id bigint;
    target_auth_user_id uuid;
    reset_record public.password_reset_requests%ROWTYPE;
BEGIN
    IF new_password IS NULL OR char_length(new_password) < 6 THEN
        RETURN QUERY SELECT false;
        RETURN;
    END IF;

    SELECT account.id, account.auth_user_id
    INTO target_user_id, target_auth_user_id
    FROM public.app_users AS account
    WHERE lower(account.username) = lower(trim(requested_username))
      AND account.approved = true
      AND account.is_admin = false
    LIMIT 1;

    IF target_user_id IS NULL OR target_auth_user_id IS NULL THEN
        RETURN QUERY SELECT false;
        RETURN;
    END IF;

    SELECT request.*
    INTO reset_record
    FROM public.password_reset_requests AS request
    WHERE request.id = requested_id
      AND request.user_id = target_user_id
    FOR UPDATE;

    IF NOT FOUND
       OR reset_record.status <> 'approved'
       OR reset_record.expires_at IS NULL
       OR reset_record.expires_at <= now()
       OR reset_record.attempt_count >= 5 THEN
        RETURN QUERY SELECT false;
        RETURN;
    END IF;

    IF requested_code IS NULL
       OR requested_code <> reset_record.request_code THEN
        UPDATE public.password_reset_requests
        SET attempt_count = attempt_count + 1,
            expires_at = CASE
                WHEN attempt_count + 1 >= 5 THEN now()
                ELSE expires_at
            END
        WHERE id = requested_id;
        RETURN QUERY SELECT false;
        RETURN;
    END IF;

    UPDATE auth.users
    SET encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = target_auth_user_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false;
        RETURN;
    END IF;

    UPDATE public.password_reset_requests
    SET status = 'completed',
        completed_at = now(),
        used_at = now(),
        request_code = ''
    WHERE id = requested_id;

    RETURN QUERY SELECT true;
END;
$function$;

REVOKE ALL ON TABLE public.password_reset_requests FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_admin_password_reset_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_password_reset(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_password_reset(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_password_reset(text, text, text, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_password_reset_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_password_reset(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_password_reset(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_password_reset(text, text, text, bigint) TO anon, authenticated;
