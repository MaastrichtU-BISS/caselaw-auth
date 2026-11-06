<#ftl output_format="plainText">
<#import "template.ftl" as layout>
<@layout.textLayout heading=msg("passwordResetHeading")>
${msg("passwordResetIntro")}

${msg("passwordResetButton")}: ${link}

${msg("emailVerificationValid", linkExpirationFormatter(linkExpiration))} ${msg("bizzyNotExpecting")}
</@layout.textLayout>
