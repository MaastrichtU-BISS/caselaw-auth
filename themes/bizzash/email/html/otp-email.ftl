<#-- The sign-in code (ext-email-otp, keycloak-magic-link): the code large and easy to copy, how long it works, and a calm "not you?". -->
<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("otpHeading") preheader=msg("otpPreheader", code) reason=msg("otpReason")>
<@layout.p>${msg("otpIntro")}</@layout.p>
<@layout.code value=code note=msg("otpValid")/>
<@layout.small>${msg("otpNotYou")}</@layout.small>
</@layout.emailLayout>
