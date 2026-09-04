(function () {
  "use strict";

  function initializeOtpControl() {
    var control = document.querySelector("[data-otp-control]");
    if (!control) return;

    var input = control.querySelector("#otp");
    var slots = Array.prototype.slice.call(control.querySelectorAll("[data-otp-slot]"));
    if (!input || slots.length !== 6) return;

    function render() {
      var digits = input.value.replace(/\D/g, "").slice(0, slots.length);
      if (input.value !== digits) input.value = digits;

      slots.forEach(function (slot, index) {
        slot.textContent = digits.charAt(index);
        slot.classList.toggle("is-filled", index < digits.length);
        slot.classList.toggle(
          "is-active",
          document.activeElement === input && index === Math.min(digits.length, slots.length - 1)
        );
      });

      control.classList.toggle("is-complete", digits.length === slots.length);
    }

    control.classList.add("is-enhanced");
    input.addEventListener("input", render);
    input.addEventListener("focus", render);
    input.addEventListener("blur", render);
    input.form.addEventListener("submit", render);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeOtpControl);
  } else {
    initializeOtpControl();
  }
})();
