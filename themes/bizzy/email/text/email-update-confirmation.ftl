<#ftl output_format="plainText">
<#import "template.ftl" as layout>
<@layout.textLayout heading=msg("emailUpdateConfirmationHeading")>
${msg("emailUpdateConfirmationIntro", newEmail)}

${msg("emailUpdateConfirmationButton")}: ${link}

${msg("emailVerificationValid", linkExpirationFormatter(linkExpiration))} ${msg("bizzyNotExpecting")}
</@layout.textLayout>
