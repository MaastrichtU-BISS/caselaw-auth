<#-- An administrator asks for required actions (Users -> Credentials -> Send email). -->
<#outputformat "plainText">
<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#sep></#items></#list></#if></#assign>
</#outputformat>
<#import "template.ftl" as layout>
<@layout.emailLayout heading=msg("executeActionsHeading") preheader=msg("executeActionsIntro", requiredActionsText)>
<@layout.p>${msg("executeActionsIntro", requiredActionsText)}</@layout.p>
<@layout.button label=msg("executeActionsButton") url=link/>
<@layout.small>${msg("executeActionsValid", linkExpirationFormatter(linkExpiration))} ${msg("bizzyNotExpecting")}</@layout.small>
</@layout.emailLayout>
