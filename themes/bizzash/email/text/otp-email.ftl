<#ftl output_format="plainText">
<#import "template.ftl" as layout>
<@layout.textLayout heading=msg("otpHeading") reason=msg("otpReason")>
${msg("otpIntro")}

    ${code}

${msg("otpValid")}.

${msg("otpNotYou")}
</@layout.textLayout>
