import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app-check.js";

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(
    "6Ld02vIsAAAAACDYOk6rSMZbNihFvL1z_RcByPXA"
  ),
  isTokenAutoRefreshEnabled: true
});
