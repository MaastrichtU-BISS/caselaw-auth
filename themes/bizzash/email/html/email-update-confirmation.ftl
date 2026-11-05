<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("emailUpdateConfirmationHeading") preheader=msg("emailUpdateConfirmationIntro", newEmail)>
<@layout.p>${msg("emailUpdateConfirmationIntro", newEmail)}</@layout.p>
<@layout.button label=msg("emailUpdateConfirmationButton") url=link/>
<@layout.small>${msg("emailVerificationValid", linkExpirationFormatter(linkExpiration))} ${msg("bizzyNotExpecting")}</@layout.small>
</@layout.emailLayout>
