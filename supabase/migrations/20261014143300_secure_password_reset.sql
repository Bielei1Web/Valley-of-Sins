-- Restore the admin-approved password reset flow without exposing reset codes
-- to unauthenticated callers. Codes are generated in the admin browser,
-- hashed before storage, and returned to the user out-of-band by an admin.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.password_reset_requests
    ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.get_password_reset_state(requested_username text)
RETURNS TABLE(
    user_id bigint,
    username text,
    request_id bigint,
    status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT account.id, account.username, request.id, request.status
    FROM public.app_users AS account
    LEFT JOIN LATERAL (
        SELECT reset.id, reset.status
        FROM public.password_reset_requests AS reset
        WHERE reset.user_id = account.id
          AND reset.status IN ('pending', 'approved')
        ORDER BY reset.created_at DESC
        LIMIT 1
    ) AS request ON true
    WHERE lower(account.username) = lower(trim(requested_username))
      AND account.approved = true
      AND account.is_admin = false
    LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.create_password_reset_request(requested_username text)
RETURNS TABLE(id bigint, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    target_user_id bigint;
    target_username text;
    existing_request record;
    new_request_id bigint;
BEGIN
    SELECT account.id, account.username
    INTO target_user_id, target_username
    FROM public.app_users AS account
    WHERE lower(account.username) = lower(trim(requested_username))
      AND account.approved = true
      AND account.is_admin = false
    LIMIT 1;

    IF target_user_id IS NULL THEN
        RETURN;
    END IF;

    SELECT reset.id, reset.status, reset.expires_at
    INTO existing_request
    FROM public.password_reset_requests AS reset
    WHERE reset.user_id = target_user_id
      AND reset.status IN ('pending', 'approved')
    ORDER BY reset.created_at DESC
    LIMIT 1;

    IF FOUND AND (
        existing_request.status = 'pending'
        OR existing_request.expires_at > now()
    ) THEN
        RETURN QUERY SELECT existing_request.id, existing_request.status;
        RETURN;
    END IF;

    IF FOUND THEN
        UPDATE public.password_reset_requests
        SET status = 'completed',
            completed_at = now(),
            used_at = now(),
            request_code = ''
        WHERE password_reset_requests.id = existing_request.id;
    END IF;

    INSERT INTO public.password_reset_requests
        (user_id, username, request_code, status, expires_at, attempt_count)
    VALUES
        (target_user_id, target_username, '', 'pending', now() + interval '24 hours', 0)
    RETURNING password_reset_requests.id INTO new_request_id;

    RETURN QUERY SELECT new_request_id, 'pending'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_password_reset(
    requested_id bigint,
    requested_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    administrator_username text;
BEGIN
    IF NOT public.is_admin_user()
       OR requested_code IS NULL
       OR requested_code !~ '^[0-9a-f]{24}$' THEN
        RETURN false;
    END IF;

    SELECT account.username
    INTO administrator_username
    FROM public.app_users AS account
    WHERE account.auth_user_id = auth.uid()
      AND account.approved = true
      AND account.is_admin = true;

    UPDATE public.password_reset_requests AS reset
    SET status = 'approved',
        request_code = extensions.crypt(requested_code, extensions.gen_salt('bf')),
        approved_at = now(),
        approved_by = administrator_username,
        expires_at = now() + interval '30 minutes',
        attempt_count = 0,
        used_at = NULL,
        completed_at = NULL
    WHERE reset.id = requested_id
      AND reset.status = 'pending';

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
SET search_path TO 'public', 'auth', 'extensions'
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

    SELECT reset.*
    INTO reset_record
    FROM public.password_reset_requests AS reset
    WHERE reset.id = requested_id
      AND reset.user_id = target_user_id
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
       OR reset_record.request_code <> extensions.crypt(requested_code, reset_record.request_code) THEN
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

REVOKE ALL ON TABLE public.password_reset_requests FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON TABLE public.password_reset_requests TO authenticated;
REVOKE ALL ON FUNCTION public.get_password_reset_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_password_reset_request(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_password_reset(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_password_reset(text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_password_reset_state(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_password_reset_request(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_password_reset(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_password_reset(text, text, text, bigint) TO anon, authenticated;
