/** Mask email for logs: j***@d***.com style (domain partially masked). */
export function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const localMasked =
    local.length <= 1 ? "*" : `${local[0]}***${local[local.length - 1]}`;
  const domainParts = domain.split(".");
  const tld = domainParts.pop() ?? "";
  const name = domainParts.join(".") || "*";
  const domainMasked =
    name.length <= 1 ? `*.${tld}` : `${name[0]}***.${tld}`;
  return `${localMasked}@${domainMasked}`;
}

/** Mask phone for logs: keep country hint and last 2 digits when possible. */
export function maskPhone(e164: string): string {
  if (e164.length <= 4) return "****";
  return `***${e164.slice(-2)}`;
}
