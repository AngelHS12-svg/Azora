export function privatePath(file) {
  const path = file.replaceAll('\\', '/');
  return /(^|\/)(data|backups|exports|downloads|secrets|\.aws|\.codex|\.agents|node_modules)(\/|$)/i.test(path)
    || /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i.test(path)
    || /\.env$/i.test(path)
    || /(^|\/)\.env(?:\..*)?$/i.test(path) && !path.endsWith('.env.example')
    || /\.(sqlite(?:3)?(?:-.*)?|db(?:-.*)?|pem|key|p12|pfx|jks|keystore|zip|7z|docx)$/i.test(path)
    || /(^|\/)(?:.*credentials.*|.*service-account.*)\.json$/i.test(path)
    || /(^|\/)(?:azora-respaldo-.*\.json|azora-movimientos-.*\.csv|azora-comprobante-.*\.txt|(?:azora|ronda)-.*\.jpg)$/i.test(path);
}

export function secretKinds(text) {
  const rules = [
    ['Token de GitHub', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
    ['Clave de AWS', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
    ['Clave de Google', /AIza[0-9A-Za-z_-]{30,}/],
    ['Clave de API', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/],
    ['Clave privada', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
