<#-- The admin console's "Test connection" for SMTP: it also previews the layout. -->
<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("emailTestHeading") preheader=msg("emailTestIntro")>
<@layout.p>${msg("emailTestIntro")}</@layout.p>
<@layout.code value="123456" note=msg("otpValid")/>
</@layout.emailLayout>
