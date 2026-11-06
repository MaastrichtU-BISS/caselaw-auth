<#ftl output_format="plainText">
<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#sep></#items></#list></#if></#assign>
<#import "template.ftl" as layout>
<@layout.textLayout heading=msg("executeActionsHeading")>
${msg("executeActionsIntro", requiredActionsText)}

${msg("executeActionsButton")}: ${link}

${msg("executeActionsValid", linkExpirationFormatter(linkExpiration))} ${msg("bizzyNotExpecting")}
</@layout.textLayout>
