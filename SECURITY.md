# Security Policy

## Supported Versions

Security fixes are provided for the latest published release and the default development branch.

## Reporting a Vulnerability

Do not open a public issue for an unpatched vulnerability. Use GitHub's private vulnerability reporting feature for this repository. If that feature is unavailable, contact the repository owner through the address associated with the GitHub profile and include:

- affected version and platform;
- reproduction steps or a minimal proof of concept;
- expected impact;
- whether user interaction is required;
- any suggested mitigation.

Avoid including real user projects, access tokens, private paths, or model files. You should receive an acknowledgement within seven days. Publication timing will be coordinated after a fix or mitigation is available.

## Scope

Relevant reports include path traversal, unsafe Tauri capability exposure, arbitrary file access, command injection, model-download integrity bypass, malicious project parsing, and release workflow compromise. General feature requests and unsupported-platform bugs belong in GitHub Issues.
