function checkUserPermission(profile, requiredPerm, rolesConfig) {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'sys_admin') return true;

    const userPerms = profile.custom_permissions || [];

    const matches = (rule, target) => {
        const cleanRule = rule.replace(/^[-+]/, '');
        if (cleanRule === '*' || cleanRule === target) return true;
        if (cleanRule.endsWith('*') && target.startsWith(cleanRule.slice(0, -1))) return true;
        if (target.startsWith(cleanRule + '.') || target.startsWith(cleanRule + ':')) return true;
        if (cleanRule.startsWith(target + '.') || cleanRule.startsWith(target + ':')) return true;
        return false;
    };

    const hasDeny = userPerms.some(p => p.startsWith('-') && matches(p, requiredPerm));
    if (hasDeny) return false;

    const hasAllow = userPerms.some(p => {
        const cleanP = p.replace(/^\+/, '');
        if (matches(cleanP, requiredPerm)) return true;
        if (cleanP.startsWith(requiredPerm + '.') || cleanP.startsWith(requiredPerm + ':')) return true;
        return false;
    });
    if (hasAllow) return true;

    return false;
}

const profileAndres = {
    id: "85361459-34a1-4c53-9137-a822720c1040",
    email: "anddres_1des@hotmail.com",
    contact_name: "GUASCA ROJAS ANDRES",
    role: "TESORERO",
    custom_permissions: [
        "+admin.procurement.providers"
    ]
};

console.log("canView 'admin.procurement.providers.view':", checkUserPermission(profileAndres, 'admin.procurement.providers.view'));
console.log("canEdit 'admin.procurement.providers.edit':", checkUserPermission(profileAndres, 'admin.procurement.providers.edit'));
console.log("hasPermission 'admin.procurement.providers':", checkUserPermission(profileAndres, 'admin.procurement.providers'));
console.log("hasPermission 'admin.procurement':", checkUserPermission(profileAndres, 'admin.procurement'));
console.log("hasPermission 'procurement':", checkUserPermission(profileAndres, 'procurement'));
