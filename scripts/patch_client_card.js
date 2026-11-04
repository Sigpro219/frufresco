const fs = require('fs');
let code = fs.readFileSync('src/components/ClientsModule.tsx', 'utf8');

const targetRegex = /<h3 style=\{\{\s*margin:\s*0,\s*fontSize:\s*'1\.05rem',\s*fontWeight:\s*'900',\s*color:\s*THEME\.colors\.textMain,\s*paddingRight:\s*'100px',\s*lineHeight:\s*'1\.3'\s*\}\}>\s*\{isB2B \? profileData\?\.company_name : isB2C \? profileData\?\.contact_name : leadData\?\.company_name\}\s*<\/h3>/;

const replacement = `<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingRight: '100px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: THEME.colors.textMain, lineHeight: '1.3' }}>
                        {isB2B ? profileData?.company_name : isB2C ? profileData?.contact_name : leadData?.company_name}
                    </h3>
                    {profileData && (
                        <SpecialClientBadge state={evaluateSpecialClientAttention({ profile: profileData, profileId: profileData.id })} />
                    )}
                </div>`;

if (targetRegex.test(code)) {
    code = code.replace(targetRegex, replacement);
    fs.writeFileSync('src/components/ClientsModule.tsx', code, 'utf8');
    console.log('Successfully patched ClientCard header');
} else {
    console.error('Target regex not matched in ClientCard');
}
