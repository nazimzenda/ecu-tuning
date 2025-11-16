# PowerShell wrapper for npm.cmd to bypass execution policy issues
# Usage: .\npm.ps1 install
#        .\npm.ps1 start
#        etc.

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

& npm.cmd $Arguments

