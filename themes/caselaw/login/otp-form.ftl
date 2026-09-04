<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true; section>
  <#if section = "title">
    ${msg("otpPageTitle")}
  <#elseif section = "header">
    ${msg("otpPageTitle")}
  <#elseif section = "show-username">
    <h1 id="kc-page-title">${msg("otpPageTitle")}</h1>
    <p class="cle-auth-intro">${msg("otpIntro")}</p>
  <#elseif section = "form">
    <form id="kc-otp-login-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
      <div class="${properties.kcFormGroupClass!}">
        <div class="${properties.kcLabelWrapperClass!}">
          <label for="otp" class="${properties.kcLabelClass!}">${msg("otpLabel")}</label>
        </div>

        <div class="${properties.kcInputWrapperClass!}">
          <div class="cle-otp-control" data-otp-control>
            <input
              id="otp"
              name="otp"
              autocomplete="one-time-code"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              type="text"
              class="${properties.kcInputClass!} cle-otp-native-input"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              autofocus
              aria-describedby="otp-field-hint<#if messagesPerField.existsError('totp')> input-error-otp-code</#if>"
              aria-invalid="<#if messagesPerField.existsError('totp')>true<#else>false</#if>"
            />
            <div class="cle-otp-slots" aria-hidden="true">
              <#list 1..6 as index>
                <span class="cle-otp-slot" data-otp-slot="${index - 1}"></span>
              </#list>
            </div>
          </div>
          <div id="otp-field-hint" class="cle-field-meta">
            <span>${msg("otpHint")}</span>
            <span>${msg("otpLength")}</span>
          </div>
          <#if messagesPerField.existsError('totp')>
            <span id="input-error-otp-code" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">${kcSanitize(messagesPerField.get('totp'))?no_esc}</span>
          </#if>
        </div>
      </div>

      <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
        <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonLargeClass!}" name="submit" id="kc-submit" type="submit" value="${msg("otpVerify")}" />
        <div class="cle-resend-row">
          <span>${msg("otpResendPrompt")}</span>
          <input name="resend" id="kc-resend" type="submit" value="${msg("otpResend")}" />
        </div>
      </div>
    </form>
  </#if>
</@layout.registrationLayout>
