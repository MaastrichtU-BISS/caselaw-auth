<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("emailVerificationHeading") preheader=msg("emailVerificationIntro")>
<@layout.p>${msg("emailVerificationIntro")}</@layout.p>
<@layout.button label=msg("emailVerificationButton") url=link/>
<@layout.small>${msg("emailVerificationValid", linkExpirationFormatter(linkExpiration))} ${msg("emailVerificationNotYou")}</@layout.small>
</@layout.emailLayout>
