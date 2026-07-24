<#macro content>
  <#assign bissLabel=(properties.footerBissLabel!'BISS Institute')>
  <#assign bissUrl=(properties.footerBissUrl!'')>
  <#assign lawTechLabel=(properties.footerLawTechLabel!'Maastricht University Law & Tech Lab')>
  <#assign lawTechUrl=(properties.footerLawTechUrl!'')>
  <#assign apiLabel=(properties.footerApiLabel!'Citations API')>
  <#assign apiUrl=(properties.footerApiUrl!'')>

  <#if bissUrl?has_content || lawTechUrl?has_content || apiUrl?has_content>
    <footer class="cle-login-footer" aria-label="Related links">
      <#if bissUrl?has_content>
        <a href="${bissUrl?html}" target="_blank" rel="noopener noreferrer">${bissLabel?html}</a>
      </#if>
      <#if lawTechUrl?has_content>
        <a href="${lawTechUrl?html}" target="_blank" rel="noopener noreferrer">${lawTechLabel?html}</a>
      </#if>
      <#if apiUrl?has_content>
        <a href="${apiUrl?html}" target="_blank" rel="noopener noreferrer">${apiLabel?html}</a>
      </#if>
    </footer>
  </#if>
</#macro>
