<#macro content>
  <#assign managedBy=(properties.footerManagedBy!'Authentication managed by BISS Institute')>
  <#assign bissLabel=(properties.footerBissLabel!'BISS Institute')>
  <#assign bissUrl=(properties.footerBissUrl!'')>
  <#assign lawTechLabel=(properties.footerLawTechLabel!'Maastricht University Law & Tech Lab')>
  <#assign lawTechUrl=(properties.footerLawTechUrl!'')>
  <#assign apiLabel=(properties.footerApiLabel!'Citations API')>
  <#assign apiUrl=(properties.footerApiUrl!'')>

  <#--
    Legal documents belong to the project being signed in to, not to this
    service. A client's own "Terms of service URL" and "Policy URL" (Clients →
    Settings → Login settings) win; the theme's values are the realm default.
    Only web addresses are linked, so a stray value cannot become a script URL.
  -->
  <#assign clientAttributes=(client.attributes)!{}>
  <#assign termsUrl=(clientAttributes.tosUri)!''>
  <#if !termsUrl?has_content><#assign termsUrl=(properties.legalTermsUrl!'')></#if>
  <#assign privacyUrl=(clientAttributes.policyUri)!''>
  <#if !privacyUrl?has_content><#assign privacyUrl=(properties.legalPrivacyUrl!'')></#if>
  <#assign cookiesUrl=(clientAttributes.cookiePolicyUri)!''>
  <#if !cookiesUrl?has_content><#assign cookiesUrl=(properties.legalCookiesUrl!'')></#if>
  <#if !termsUrl?matches('https?://.+')><#assign termsUrl=''></#if>
  <#if !privacyUrl?matches('https?://.+')><#assign privacyUrl=''></#if>
  <#if !cookiesUrl?matches('https?://.+')><#assign cookiesUrl=''></#if>
  <#assign hasLegal=(termsUrl?has_content || privacyUrl?has_content || cookiesUrl?has_content)>

  <#if bissUrl?has_content || lawTechUrl?has_content || apiUrl?has_content || hasLegal>
    <footer class="cle-login-footer" aria-label="Related links">
      <#if bissUrl?has_content || lawTechUrl?has_content || apiUrl?has_content>
        <p>${managedBy}</p>
        <nav aria-label="Institution and product links">
          <#if bissUrl?has_content>
            <a href="${bissUrl}" target="_blank" rel="noopener noreferrer">${bissLabel}</a>
          </#if>
          <#if lawTechUrl?has_content>
            <a href="${lawTechUrl}" target="_blank" rel="noopener noreferrer">${lawTechLabel}</a>
          </#if>
          <#if apiUrl?has_content>
            <a href="${apiUrl}" target="_blank" rel="noopener noreferrer">${apiLabel}</a>
          </#if>
        </nav>
      </#if>
      <#if hasLegal>
        <nav class="cle-login-legal" aria-label="${msg("legalNavLabel")}">
          <#if termsUrl?has_content>
            <a href="${termsUrl}" target="_blank" rel="noopener noreferrer">${msg("legalTerms")}</a>
          </#if>
          <#if privacyUrl?has_content>
            <a href="${privacyUrl}" target="_blank" rel="noopener noreferrer">${msg("legalPrivacy")}</a>
          </#if>
          <#if cookiesUrl?has_content>
            <a href="${cookiesUrl}" target="_blank" rel="noopener noreferrer">${msg("legalCookies")}</a>
          </#if>
        </nav>
      </#if>
    </footer>
  </#if>
</#macro>
