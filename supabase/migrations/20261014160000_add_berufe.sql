CREATE TABLE IF NOT EXISTS public.berufe_tabs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
    created_by bigint NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.berufe_recipes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    berufe_tab_id bigint NOT NULL REFERENCES public.berufe_tabs(id) ON DELETE CASCADE,
    output_name text NOT NULL CHECK (char_length(btrim(output_name)) BETWEEN 1 AND 100),
    output_qty integer NOT NULL CHECK (output_qty > 0),
    ingredients jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(ingredients) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS berufe_tabs_name_lower_unique
    ON public.berufe_tabs (lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS berufe_recipes_tab_output_name_unique
    ON public.berufe_recipes (berufe_tab_id, lower(btrim(output_name)));

INSERT INTO public.app_user_tab_permissions (user_id, tab_key, can_view, can_edit, can_delete)
SELECT users.id, 'berufe', true, false, false
FROM public.app_users AS users
ON CONFLICT (user_id, tab_key) DO NOTHING;

ALTER TABLE public.berufe_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.berufe_recipes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.berufe_tabs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.berufe_recipes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.berufe_tabs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.berufe_recipes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.berufe_recipes_id_seq TO authenticated;

DROP POLICY IF EXISTS berufe_tabs_select ON public.berufe_tabs;
CREATE POLICY berufe_tabs_select
    ON public.berufe_tabs
    FOR SELECT
    TO authenticated
    USING (
        public.has_tab_permission('berufe', 'view')
        OR public.has_tab_permission('berufe', 'edit')
        OR public.has_tab_permission('berufe', 'delete')
        OR public.has_special_permission('administrator_rechte')
    );

DROP POLICY IF EXISTS berufe_recipes_select ON public.berufe_recipes;
CREATE POLICY berufe_recipes_select
    ON public.berufe_recipes
    FOR SELECT
    TO authenticated
    USING (
        public.has_tab_permission('berufe', 'view')
        OR public.has_tab_permission('berufe', 'edit')
        OR public.has_tab_permission('berufe', 'delete')
        OR public.has_special_permission('administrator_rechte')
    );

DROP POLICY IF EXISTS berufe_recipes_insert ON public.berufe_recipes;
CREATE POLICY berufe_recipes_insert
    ON public.berufe_recipes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.has_tab_permission('berufe', 'edit')
        OR public.has_special_permission('administrator_rechte')
    );

DROP POLICY IF EXISTS berufe_recipes_update ON public.berufe_recipes;
CREATE POLICY berufe_recipes_update
    ON public.berufe_recipes
    FOR UPDATE
    TO authenticated
    USING (
        public.has_tab_permission('berufe', 'edit')
        OR public.has_special_permission('administrator_rechte')
    )
    WITH CHECK (
        public.has_tab_permission('berufe', 'edit')
        OR public.has_special_permission('administrator_rechte')
    );

DROP POLICY IF EXISTS berufe_recipes_delete ON public.berufe_recipes;
CREATE POLICY berufe_recipes_delete
    ON public.berufe_recipes
    FOR DELETE
    TO authenticated
    USING (
        public.has_tab_permission('berufe', 'delete')
        OR public.has_special_permission('administrator_rechte')
    );

CREATE OR REPLACE FUNCTION public.berufe_create_tab(p_name text)
RETURNS public.berufe_tabs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    app_user_id bigint;
    clean_name text := btrim(p_name);
    created_tab public.berufe_tabs;
BEGIN
    IF auth.uid() IS NULL OR NOT public.has_special_permission('administrator_rechte') THEN
        RAISE EXCEPTION 'Administrator permission required' USING ERRCODE = '42501';
    END IF;

    IF clean_name IS NULL OR char_length(clean_name) NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'Berufe tab name must contain between 1 and 50 characters'
            USING ERRCODE = '22023';
    END IF;

    IF lower(clean_name) = 'vorlage' THEN
        RAISE EXCEPTION 'A tab named Vorlage already exists' USING ERRCODE = '23505';
    END IF;

    SELECT users.id
    INTO app_user_id
    FROM public.app_users AS users
    WHERE users.auth_user_id = auth.uid()
      AND users.approved = true;

    IF app_user_id IS NULL THEN
        RAISE EXCEPTION 'Application user not found' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.berufe_tabs (name, created_by)
    VALUES (clean_name, app_user_id)
    RETURNING * INTO created_tab;

    RETURN created_tab;
END;
$function$;

CREATE OR REPLACE FUNCTION public.berufe_delete_tab(p_tab_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    deleted_count integer;
BEGIN
    IF auth.uid() IS NULL OR NOT public.has_special_permission('administrator_rechte') THEN
        RAISE EXCEPTION 'Administrator permission required' USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.berufe_tabs
    WHERE id = p_tab_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.berufe_create_tab(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.berufe_delete_tab(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.berufe_create_tab(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.berufe_delete_tab(bigint) TO authenticated;
