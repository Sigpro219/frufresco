
CREATE OR REPLACE FUNCTION debug_policies()
RETURNS TABLE (
    schemaname name,
    tablename name,
    policyname name,
    permissive text,
    roles name[],
    cmd text,
    qual text,
    with_check text
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.schemaname,
        p.tablename,
        p.policyname,
        p.permissive,
        p.roles,
        p.cmd,
        p.qual::text,
        p.with_check::text
    FROM
        pg_policies p
    WHERE
        p.schemaname = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
