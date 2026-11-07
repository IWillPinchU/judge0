#!/bin/bash
# Container entrypoint with isolate v2 cgroup-mode setup.
#
# When cgroup v2 is mounted RW (privileged container, modern kernel),
# we lay out a sibling cgroup hierarchy so isolate can use --cg mode and
# enforce per-question memory_limit as RSS (memory.max) instead of
# RLIMIT_AS (virtual address). Without this, Java 21 / Python NumPy
# submissions fail at any memory_limit < ~1.5 GiB because their runtimes
# pre-reserve huge virtual address blocks even when actual RSS is small.
#
# Layout we want at startup:
#
#   <container cgroup>/                from /proc/self/cgroup
#     ├── api.scope/                   Rails / Resque workers move here (PID 1's new home)
#     └── isolate.slice/               isolate v2 creates per-box children under this
#         ├── box-0/
#         └── ...
#
# isolate v2's default config is `cg_root = "auto:/run/isolate/cgroup"`,
# meaning isolate reads the actual cgroup path from `/run/isolate/cgroup`.
#
# When cgroup setup succeeds, we export OVERRIDE_PER_PROCESS_*=false so
# judge0.conf's `${OVERRIDE_*:-true}` evaluates to "false", which makes
# Config::ENABLE_PER_PROCESS_*=false, which makes SuiteJob add `--cg`,
# which makes isolate use memory.max instead of RLIMIT_AS.
#
# When cgroup setup fails (cgroup v1 host, non-privileged, or controllers
# not delegated), we leave OVERRIDE_* unset and isolate stays in rlimit mode.

set -uo pipefail

CG_SELF="$(awk -F: '$1 == "0" {print $3}' /proc/self/cgroup 2>/dev/null)"
CG_ROOT="/sys/fs/cgroup${CG_SELF%/}"

# In Kubernetes / containerd, CG_SELF is > 200 characters. Isolate 2.0 has a 256-byte
# path buffer in cg_makepath, which asserts if path length reaches 256 bytes.
# If CG_ROOT path exceeds 100 chars and root cgroup is writable, use /sys/fs/cgroup directly.
if [ "${#CG_ROOT}" -gt 100 ] && [ -w "/sys/fs/cgroup/cgroup.subtree_control" ]; then
    CG_ROOT="/sys/fs/cgroup"
fi

CG_PARENT_PROCS="$CG_ROOT/cgroup.procs"
CG_PARENT_SUBTREE="$CG_ROOT/cgroup.subtree_control"
CG_API_SCOPE="$CG_ROOT/api.scope"
CG_ISOLATE_SLICE="$CG_ROOT/isolate.slice"

setup_cgroup_v2() {
    # Cgroup v2 only — bail on v1 hosts.
    [ -f "$CG_ROOT/cgroup.controllers" ] || { echo "[entrypoint] cgroup v2 not mounted"; return 1; }
    # Need write access to subtree_control (i.e. privileged + delegated cgroup).
    [ -w "$CG_PARENT_SUBTREE" ] || { echo "[entrypoint] $CG_PARENT_SUBTREE not writable"; return 1; }

    mkdir -p "$CG_API_SCOPE" "$CG_ISOLATE_SLICE" || return 1

    # Move every PID currently in the parent cgroup into api.scope. After
    # this the parent has zero direct processes and we can write to its
    # subtree_control without hitting "no internal process constraint".
    if [ -r "$CG_PARENT_PROCS" ]; then
        while IFS= read -r pid; do
            [ -n "$pid" ] || continue
            echo "$pid" > "$CG_API_SCOPE/cgroup.procs" 2>/dev/null || true
        done < "$CG_PARENT_PROCS"
    fi

    # Enable controllers in the parent so children inherit them.
    for c in memory pids cpu; do
        echo "+$c" > "$CG_PARENT_SUBTREE" 2>/dev/null || true
    done

    # Verify isolate.slice actually has the controllers we need.
    local available
    available="$(cat "$CG_ISOLATE_SLICE/cgroup.controllers" 2>/dev/null || echo "")"
    case "$available" in
        *memory*)
            : # good
            ;;
        *)
            echo "[entrypoint] memory controller not available in isolate.slice (got: $available)"
            return 1
            ;;
    esac
    case "$available" in
        *pids*)
            : # good
            ;;
        *)
            echo "[entrypoint] pids controller not available in isolate.slice (got: $available)"
            return 1
            ;;
    esac

    # Enable subtree_control on isolate.slice so per-box children inherit memory/pids/cpu.
    for c in memory pids cpu; do
        echo "+$c" > "$CG_ISOLATE_SLICE/cgroup.subtree_control" 2>/dev/null || true
    done

    # Tell isolate v2 where the delegation root and locks are.
    mkdir -p /run/isolate/locks
    echo "$CG_ISOLATE_SLICE" > /run/isolate/cgroup

    return 0
}

if setup_cgroup_v2; then
    echo "[entrypoint] isolate cgroup-v2 mode active (memory limits enforced as RSS)"
    export OVERRIDE_PER_PROCESS_TIME=false
    export OVERRIDE_PER_PROCESS_MEMORY=false
else
    echo "[entrypoint] cgroup v2 setup unavailable; isolate stays in rlimit mode (memory limits enforced as virtual address)"
fi

cron
exec "$@"
