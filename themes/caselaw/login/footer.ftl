<#macro content>
  <#assign managedBy=(properties.footerManagedBy!'Authentication managed by BISS Institute')>
  <#assign bissLabel=(properties.footerBissLabel!'BISS Institute')>
  <#assign bissUrl=(properties.footerBissUrl!'')>
  <#assign lawTechLabel=(properties.footerLawTechLabel!'Maastricht University Law & Tech Lab')>
  <#assign lawTechUrl=(properties.footerLawTechUrl!'')>
  <#assign apiLabel=(properties.footerApiLabel!'Citations API')>
  <#assign apiUrl=(properties.footerApiUrl!'')>

  <#if bissUrl?has_content || lawTechUrl?has_content || apiUrl?has_content>
    <footer class="cle-login-footer" aria-label="Related links">
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
    </footer>
  </#if>
</#macro>
