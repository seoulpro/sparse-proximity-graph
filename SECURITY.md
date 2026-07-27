# Security policy

`sparse-proximity-graph` operates only on caller-provided arrays and does not
access the filesystem or network.

## Supported versions

Security fixes are made against the latest published release in the `0.x`
series.

## Reporting

Report privately if a crafted point or edge set can escape validation, mutate
caller data, cause disproportionate resource consumption beyond the documented
dense-graph behavior, or produce unsafe object-key handling. Use the
repository's private vulnerability reporting feature; if unavailable, request
a private channel in a public issue without attaching sensitive data.

A useful report includes the affected version, minimal input, options, observed
complexity or failure, and a mitigation.

## Scope

Graph quality, approximate-planarity examples, and proposed heuristic changes
belong in public issues. The output is not a proof of connectivity or
planarity, and the package is not a safety or access-control system. Callers
accepting untrusted datasets should enforce point-count, coordinate, and
runtime limits.
