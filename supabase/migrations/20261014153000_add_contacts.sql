CREATE TABLE IF NOT EXISTS public.contacts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name text CHECK (first_name IS NULL OR char_length(btrim(first_name)) BETWEEN 1 AND 80),
    last_name text CHECK (last_name IS NULL OR char_length(btrim(last_name)) BETWEEN 1 AND 80),
    nickname text CHECK (nickname IS NULL OR char_length(nickname) <= 80),
    notes text CHECK (notes IS NULL OR char_length(notes) <= 5000),
    telegram_number text CHECK (telegram_number IS NULL OR char_length(telegram_number) <= 80),
    CONSTRAINT contacts_name_present CHECK (
        COALESCE(
            NULLIF(btrim(first_name), ''),
            NULLIF(btrim(last_name), ''),
            NULLIF(btrim(nickname), '')
        ) IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS contacts_name_idx
    ON public.contacts (lower(last_name), lower(first_name));

INSERT INTO public.app_user_tab_permissions (user_id, tab_key, can_view, can_edit, can_delete)
SELECT users.id, 'kontakte', true, false, false
FROM public.app_users AS users
ON CONFLICT (user_id, tab_key) DO NOTHING;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.contacts_id_seq TO authenticated;

DROP POLICY IF EXISTS contacts_select ON public.contacts;
CREATE POLICY contacts_select
    ON public.contacts
    FOR SELECT
    TO authenticated
    USING (
        public.has_tab_permission('kontakte', 'view')
        OR public.has_tab_permission('kontakte', 'edit')
        OR public.has_tab_permission('kontakte', 'delete')
        OR public.has_special_permission('administrator_rechte')
    );

DROP POLICY IF EXISTS contacts_insert ON public.contacts;
CREATE POLICY contacts_insert
    ON public.contacts
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.has_tab_permission('kontakte', 'edit')
        OR public.has_special_permission('administrator_rechte')
    );

DROP POLICY IF EXISTS contacts_update ON public.contacts;
CREATE POLICY contacts_update
    ON public.contacts
    FOR UPDATE
    TO authenticated
    USING (
        public.has_tab_permission('kontakte', 'edit')
        OR public.has_special_permission('administrator_rechte')
    )
    WITH CHECK (
        public.has_tab_permission('kontakte', 'edit')
        OR public.has_special_permission('administrator_rechte')
    );

DROP POLICY IF EXISTS contacts_delete ON public.contacts;
CREATE POLICY contacts_delete
    ON public.contacts
    FOR DELETE
    TO authenticated
    USING (
        public.has_tab_permission('kontakte', 'delete')
        OR public.has_special_permission('administrator_rechte')
    );
