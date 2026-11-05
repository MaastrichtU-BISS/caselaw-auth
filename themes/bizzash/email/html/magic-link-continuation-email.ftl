<#-- The sign-in link (ext-magic-form). Off in the passwordless flow; styled so it matches if it is ever turned on. -->
<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("magicLinkHeading") preheader=msg("magicLinkPreheader") reason=msg("otpReason")>
<@layout.p>${msg("magicLinkIntro")}</@layout.p>
<@layout.button label=msg("magicLinkButton") url=magicLink/>
<@layout.small>${msg("otpNotYou")}</@layout.small>
</@layout.emailLayout>
