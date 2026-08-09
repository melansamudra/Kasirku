# Snapshot file
# Unset all aliases to avoid conflicts with functions
unalias -a 2>/dev/null || true
shopt -s expand_aliases
# Check for rg availability
if ! (unalias rg 2>/dev/null; command -v rg) >/dev/null 2>&1; then
  function rg {
  local _cc_bin="${CLAUDE_CODE_EXECPATH:-}"
  [[ -x $_cc_bin ]] || _cc_bin=/c/Users/WIN10/.local/bin/claude.exe
  if [[ ! -x $_cc_bin ]]; then command rg ${1+"$@"}; return; fi
  if [[ -n ${ZSH_VERSION:-} ]]; then
    ARGV0=rg "$_cc_bin" ${1+"$@"}
  elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    ARGV0=rg "$_cc_bin" ${1+"$@"}
  else
    (exec -a rg "$_cc_bin" ${1+"$@"})
  fi
}
fi
export PATH='/c/Users/WIN10/bin:/mingw64/bin:/usr/local/bin:/usr/bin:/bin:/mingw64/bin:/usr/bin:/c/Users/WIN10/bin:/c/Python314/Scripts:/c/Python314:/c/Windows/system32:/c/Windows:/c/Windows/System32/Wbem:/c/Windows/System32/WindowsPowerShell/v1.0:/c/Windows/System32/OpenSSH:/c/Program Files (x86)/QuickTime/QTSystem:/c/Program Files/nodejs:/c/ProgramData/chocolatey/bin:/cmd:/c/Users/WIN10/AppData/Local/Microsoft/WindowsApps:/c/Users/WIN10/AppData/Roaming/npm:/c/Users/WIN10/AppData/Local/Programs/Microsoft VS Code/bin:/c/Program Files/nodejs:/c/Python314:/mingw64/bin:/usr/bin/vendor_perl:/usr/bin/core_perl:/c/Users/WIN10/AppData/Roaming/Claude/local-agent-mode-sessions/skills-plugin/04ad99f5-c620-4a11-b1ab-426c834f9bce/ebea9c0d-8058-4d9b-87fc-7f18f50ce211/bin'
