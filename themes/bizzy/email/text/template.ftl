<#ftl output_format="plainText">
<#-- The plain-text version of the layout: the word BIZZY, the heading, the text, the same footer as the HTML. -->
<#assign productUrl = (properties.emailProductUrl)!"https://app.usebizzy.eu">
<#macro textLayout heading="" reason="">
BIZZY

<#if heading?has_content>${heading}

</#if><#nested>

--
<#if reason?has_content>${reason}
</#if>Bizzy · ${msg("bizzyMadeAt")}
${msg("bizzyBiss")} · ${productUrl}
</#macro>
