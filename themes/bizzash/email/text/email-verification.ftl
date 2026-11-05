<#ftl output_format="plainText">
<#import "template.ftl" as layout>
<@layout.textLayout heading=msg("emailVerificationHeading")>
${msg("emailVerificationIntro")}

${msg("emailVerificationButton")}: ${link}

${msg("emailVerificationValid", linkExpirationFormatter(linkExpiration))} ${msg("emailVerificationNotYou")}
</@layout.textLayout>
