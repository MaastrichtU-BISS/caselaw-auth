<#--
  Bizzy's email layout. The same markup as the Bizzy app's emails
  (server/lib/email/layout.ts in MaastrichtU-BISS/bizzash), so a sign-in code
  and an invitation look like one product.

  Email-client rules: tables for layout, inline styles (the <style> block only
  adds dark mode and the phone layout), no web fonts needed (Inter, then the
  system sans), 600 px and fluid below, a button that works in Outlook without
  VML, and nothing that needs a picture: the logo is one small hosted image
  beside the word BIZZY in live text, so with pictures blocked the header still
  reads BIZZY and the message is complete.

  Templates call <@layout.emailLayout heading=… preheader=… reason=…> and fill
  it with the blocks below (p, small, code, button). Base Keycloak emails that
  this theme does not override call it without arguments and still get the
  frame, header and footer around their own paragraphs.
-->
<#assign font = "Inter,'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif">
<#assign mono = "'SF Mono',SFMono-Regular,Menlo,Consolas,'Roboto Mono','Liberation Mono',monospace">
<#assign logoUrl = (properties.emailLogoUrl)!"">
<#assign productUrl = (properties.emailProductUrl)!"https://bizzy.biss-institute.com">
<#assign productHost = (properties.emailProductHost)!"bizzy.biss-institute.com">

<#macro emailLayout heading="" preheader="" reason="">
<!doctype html>
<html lang="${locale.language}" dir="${(ltr!true)?then('ltr','rtl')}" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${heading}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse}
a{color:#005CA9}
.bz-body p{margin:0 0 16px;font-family:${font};font-size:15px;line-height:24px;color:#3D3B37}
@media (max-width:620px){
  .bz-pad{padding-left:16px!important;padding-right:16px!important}
  .bz-card{padding:28px 22px 12px!important}
  .bz-code-v{font-size:30px!important;letter-spacing:7px!important}
  .bz-h1{font-size:21px!important;line-height:28px!important}
}
@media (prefers-color-scheme:dark){
  .bz-frame,body{background:#141619!important}
  .bz-card{background:#1E2125!important;border-color:#33373D!important}
  .bz-code td{background:#16181B!important;border-color:#33373D!important}
  .bz-code-v{color:#FFFFFF!important}
  .bz-h1,.bz-word{color:#F2F1EE!important}
  .bz-card p,.bz-card td{color:#D5D3CE!important}
  .bz-card .bz-b{color:#FFFFFF!important}
  .bz-card .bz-m{color:#A19E98!important}
  .bz-foot,.bz-foot a{color:#A19E98!important}
}
[data-ogsc] .bz-card{background:#1E2125!important}
[data-ogsc] .bz-h1,[data-ogsc] .bz-word,[data-ogsc] .bz-code-v{color:#F2F1EE!important}
</style>
</head>
<body class="bz-frame" style="margin:0;padding:0;background:#F3F2EF">
<#if preheader?has_content><div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F3F2EF">${preheader}<#list 1..40 as i>&#8199;&#65279;&#847; </#list></div></#if>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bz-frame" bgcolor="#F3F2EF" style="background:#F3F2EF">
<tr><td align="center" class="bz-pad" style="padding:28px 24px 36px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;border-collapse:separate">
<tr><td style="padding:0 4px 18px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<#if logoUrl?has_content><td width="28" style="width:28px;padding-right:10px;vertical-align:middle"><img src="${logoUrl}" width="28" height="28" alt="" style="display:block;width:28px;height:28px;border:0;outline:none"></td></#if>
<td style="vertical-align:middle;padding-top:5px"><a href="${productUrl}" target="_blank" class="bz-word" style="font-family:Overpass,${font};font-size:15px;line-height:20px;font-weight:400;letter-spacing:4px;color:#0B2340;text-decoration:none">BIZZY</a></td>
</tr></table>
</td></tr>
<tr><td class="bz-card bz-body" bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #E7E5E0;border-radius:14px;padding:36px 40px 16px;font-family:${font};font-size:15px;line-height:24px;color:#3D3B37">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 0 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" height="4" bgcolor="#FFC917" style="width:36px;height:4px;background:#FFC917;border-radius:2px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
<#if heading?has_content><tr><td style="padding:0 0 14px"><h1 class="bz-h1" style="margin:0;font-family:${font};font-size:22px;line-height:30px;font-weight:600;color:#1D1C1A;mso-line-height-rule:exactly">${heading}</h1></td></tr></#if>
<tr><td style="padding:0;font-family:${font};font-size:15px;line-height:24px;color:#3D3B37">
<#nested>
</td></tr>
</table>
</td></tr>
<tr><td class="bz-foot" style="padding:20px 4px 0;font-family:${font};font-size:12px;line-height:19px;color:#6F6C66">
<#if reason?has_content>${reason}<br></#if><strong style="font-weight:600">Bizzy</strong> &middot; ${msg("bizzyMadeAt")}<br>${msg("bizzyBiss")} &middot; <a href="${productUrl}" target="_blank" style="color:#6F6C66;text-decoration:underline">${productHost}</a>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
</#macro>

<#-- A paragraph. Pass `strong` for one bold value inside it: the text then is the message key's two halves around it. -->
<#macro p>
<p style="margin:0 0 16px;font-family:${font};font-size:15px;line-height:24px;color:#3D3B37"><#nested></p>
</#macro>

<#macro b><strong class="bz-b" style="font-weight:600;color:#1D1C1A"><#nested></strong></#macro>

<#macro small>
<p class="bz-m" style="margin:0 0 16px;font-family:${font};font-size:13px;line-height:20px;color:#6F6C66"><#nested></p>
</#macro>

<#-- The code, large and easy to copy: monospace, spaced by letter-spacing (copying keeps the digits together). -->
<#macro code value note="">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bz-code" style="margin:4px 0 22px;border-collapse:separate"><tr><td align="center" bgcolor="#F7F6F3" style="background:#F7F6F3;border:1px solid #E7E5E0;border-radius:12px;padding:22px 12px 18px">
<div class="bz-code-v" style="font-family:${mono};font-size:36px;line-height:44px;font-weight:600;letter-spacing:10px;color:#0B2340;mso-line-height-rule:exactly">${value}</div>
<#if note?has_content><div class="bz-m" style="font-family:${font};font-size:13px;line-height:20px;color:#6F6C66;padding-top:6px">${note}</div></#if>
</td></tr></table>
</#macro>

<#macro button label url>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr><td bgcolor="#005CA9" style="background:#005CA9;border-radius:10px;mso-padding-alt:13px 24px">
<a href="${url}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${font};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #005CA9">${label}</a>
</td></tr></table>
</#macro>
