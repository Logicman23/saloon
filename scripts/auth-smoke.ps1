# Auth / RBAC smoke test.
#
#   npm run dev
#   pwsh scripts/auth-smoke.ps1            # defaults to http://localhost:3000
#   SMOKE_BASE=http://localhost:3001 pwsh scripts/auth-smoke.ps1
#
# Run against a DEV server: `next start` sets NODE_ENV=production, which marks
# the session cookie Secure, and a plain-HTTP client will not send it back.
# Against https:// a production server works fine.
#
# Depends on the seeded demo accounts in src/lib/auth/users.server.ts.

$ErrorActionPreference = "SilentlyContinue"
$base = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { "http://localhost:3000" }
$pass = 0; $fail = 0

function Check($label, $condition, $detail) {
  if ($condition) { $script:pass++; "PASS  $label" }
  else { $script:fail++; "FAIL  $label  --> $detail" }
}

# --- 1. Unauthenticated access is redirected to /login -----------------
$r = Invoke-WebRequest "$base/" -MaximumRedirection 0 -UseBasicParsing
Check "anon GET /  redirects" ($r.StatusCode -eq 307 -or $r.StatusCode -eq 302) "status=$($r.StatusCode)"
Check "anon GET /  -> /login" ($r.Headers.Location -match "/login") "loc=$($r.Headers.Location)"

$r = Invoke-WebRequest "$base/reports" -MaximumRedirection 0 -UseBasicParsing
Check "anon GET /reports -> /login with next param" ($r.Headers.Location -match "/login" -and $r.Headers.Location -match "next=") "loc=$($r.Headers.Location)"

# --- 2. Login rejects bad credentials ----------------------------------
$body = @{ email = "owner@sanasbeauty.pk"; password = "wrong-password" } | ConvertTo-Json
try {
  $r = Invoke-WebRequest "$base/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
  Check "bad password rejected" $false "unexpected 2xx"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Check "bad password -> 401" ($code -eq 401) "status=$code"
}

# --- 3. Deactivated account -------------------------------------------
$body = @{ email = "former@sanasbeauty.pk"; password = "Studio@2026" } | ConvertTo-Json
try {
  Invoke-WebRequest "$base/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing | Out-Null
  Check "deactivated account blocked" $false "unexpected 2xx"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Check "deactivated account -> 403" ($code -eq 403) "status=$code"
}

# --- 4. Successful logins per role -------------------------------------
function Login($email, $password) {
  $b = @{ email = $email; password = $password; remember = $true } | ConvertTo-Json
  $sess = $null
  $resp = Invoke-WebRequest "$base/api/auth/login" -Method POST -Body $b -ContentType "application/json" -UseBasicParsing -SessionVariable sess
  return @{ resp = $resp; session = $sess }
}

$admin   = Login "owner@sanasbeauty.pk" "Owner@2026"
$cashier = Login "reception@sanasbeauty.pk" "Front@2026"
$staff   = Login "ayesha@sanasbeauty.pk" "Studio@2026"

Check "admin login 200"   ($admin.resp.StatusCode -eq 200)   "status=$($admin.resp.StatusCode)"
Check "cashier login 200" ($cashier.resp.StatusCode -eq 200) "status=$($cashier.resp.StatusCode)"
Check "staff login 200"   ($staff.resp.StatusCode -eq 200)   "status=$($staff.resp.StatusCode)"

$sc = $admin.resp.Headers['Set-Cookie']
Check "session cookie is HttpOnly" ($sc -match "HttpOnly") "cookie=$sc"
Check "session cookie is SameSite=Lax" ($sc -match "SameSite=Lax") "cookie=$sc"

$adminJson   = $admin.resp.Content   | ConvertFrom-Json
$cashierJson = $cashier.resp.Content | ConvertFrom-Json
$staffJson   = $staff.resp.Content   | ConvertFrom-Json
Check "admin lands on /"              ($adminJson.redirectTo -eq "/")            "got=$($adminJson.redirectTo)"
Check "cashier lands on /pos"         ($cashierJson.redirectTo -eq "/pos")       "got=$($cashierJson.redirectTo)"
Check "staff lands on /my-schedule"   ($staffJson.redirectTo -eq "/my-schedule") "got=$($staffJson.redirectTo)"
Check "login response omits password" (-not ($admin.resp.Content -match "passwordHash|passwordSalt")) "leaked hash"

# --- 5. Route enforcement per role -------------------------------------
function Visit($sess, $path) {
  $r = Invoke-WebRequest "$base$path" -WebSession $sess -MaximumRedirection 0 -UseBasicParsing
  return @{ status = $r.StatusCode; loc = [string]$r.Headers.Location }
}

# Admin reaches everything
foreach ($p in @("/", "/reports", "/expenses", "/staff", "/pos", "/inventory")) {
  $v = Visit $admin.session $p
  Check "ADMIN can reach $p" ($v.status -eq 200) "status=$($v.status) loc=$($v.loc)"
}

# Cashier: allowed
foreach ($p in @("/pos", "/appointments", "/clients")) {
  $v = Visit $cashier.session $p
  Check "CASHIER can reach $p" ($v.status -eq 200) "status=$($v.status) loc=$($v.loc)"
}
# Cashier: denied financials
foreach ($p in @("/reports", "/expenses", "/staff", "/")) {
  $v = Visit $cashier.session $p
  Check "CASHIER blocked from $p" ($v.loc -match "/denied") "status=$($v.status) loc=$($v.loc)"
}

# Staff: allowed
foreach ($p in @("/my-schedule", "/my-commissions")) {
  $v = Visit $staff.session $p
  Check "STAFF can reach $p" ($v.status -eq 200) "status=$($v.status) loc=$($v.loc)"
}
# Staff: denied
foreach ($p in @("/pos", "/reports", "/expenses", "/inventory", "/clients", "/staff", "/")) {
  $v = Visit $staff.session $p
  Check "STAFF blocked from $p" ($v.loc -match "/denied") "status=$($v.status) loc=$($v.loc)"
}

# --- 6. Signed-in user bounced off /login ------------------------------
$v = Visit $admin.session "/login"
Check "signed-in user redirected off /login" ($v.loc -match "/$|/pos|/my-schedule") "loc=$($v.loc)"

# --- 7. Forged / tampered cookie is rejected ---------------------------
$forged = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$forged.Cookies.Add((New-Object System.Net.Cookie("sbs_session", "eyJzdWIiOiJ1c3Jfb3duZXIiLCJyb2xlIjoiQURNSU4ifQ.deadbeef", "/", "localhost")))
$v = Visit $forged "/reports"
Check "forged cookie rejected" ($v.loc -match "/login") "status=$($v.status) loc=$($v.loc)"

# --- 8. Override endpoint requires a session ---------------------------
$b = @{ pin = "4726"; permission = "pos.discount.override" } | ConvertTo-Json
try {
  Invoke-WebRequest "$base/api/auth/override" -Method POST -Body $b -ContentType "application/json" -UseBasicParsing | Out-Null
  Check "override requires auth" $false "unexpected 2xx"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Check "override without session -> 401" ($code -eq 401) "status=$code"
}

# Correct PIN with a cashier session succeeds
$r = Invoke-WebRequest "$base/api/auth/override" -Method POST -Body $b -ContentType "application/json" -WebSession $cashier.session -UseBasicParsing
Check "override with correct PIN -> 200" ($r.StatusCode -eq 200) "status=$($r.StatusCode)"

# Wrong PIN is refused
$bad = @{ pin = "0000"; permission = "pos.discount.override" } | ConvertTo-Json
try {
  Invoke-WebRequest "$base/api/auth/override" -Method POST -Body $bad -ContentType "application/json" -WebSession $cashier.session -UseBasicParsing | Out-Null
  Check "wrong PIN refused" $false "unexpected 2xx"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Check "wrong PIN -> 403" ($code -eq 403) "status=$code"
}

# --- 9. Logout clears the cookie ---------------------------------------
$r = Invoke-WebRequest "$base/api/auth/logout" -Method POST -WebSession $admin.session -UseBasicParsing
Check "logout 200" ($r.StatusCode -eq 200) "status=$($r.StatusCode)"

""
"=================================="
"PASSED: $pass    FAILED: $fail"
"=================================="


