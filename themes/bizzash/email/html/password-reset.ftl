<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("passwordResetHeading") preheader=msg("passwordResetIntro")>
<@layout.p>${msg("passwordResetIntro")}</@layout.p>
<@layout.button label=msg("passwordResetButton") url=link/>
<@layout.small>${msg("emailVerificationValid", linkExpirationFormatter(linkExpiration))} ${msg("bizzyNotExpecting")}</@layout.small>
</@layout.emailLayout>
