<#ftl output_format="plainText">
<#import "template.ftl" as layout>
<@layout.textLayout heading=msg("magicLinkHeading") reason=msg("otpReason")>
${msg("magicLinkIntro")}

${msg("magicLinkButton")}: ${magicLink}

${msg("otpNotYou")}
</@layout.textLayout>
