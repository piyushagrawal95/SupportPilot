export const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 8 characters and include at least 1 uppercase letter and 1 special character.";

export function checkPasswordRules(password = "") {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const passedCount = [minLength, hasUppercase, hasSpecial].filter(Boolean).length;
  return {
    minLength,
    hasUppercase,
    hasSpecial,
    passedCount,
    isValid: minLength && hasUppercase && hasSpecial,
  };
}
