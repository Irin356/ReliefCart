
const rawUrl = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!rawUrl || !key) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

// Normalize the URL to the project root.
const baseUrl = rawUrl
  .replace(/\/rest\/v1\/?$/, "")
  .replace(/\/+$/, "");

console.log("Project URL:", new URL(baseUrl).host);
console.log("Key type:", key.startsWith("sb_secret_")
  ? "New Supabase secret key"
  : key.startsWith("eyJ")
    ? "Legacy JWT key"
    : "Unknown key format"
);

try {
  const response = await fetch(
    `${baseUrl}/rest/v1/donations?select=id&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: key,
        Accept: "application/json",
      },
    }
  );

  const body = await response.text();

  console.log("HTTP status:", response.status);

  if (!response.ok) {
    console.error("Supabase response:", body);
    process.exitCode = 1;
  } else {
    const records = JSON.parse(body);
    console.log("SUCCESS: Supabase connected!");
    console.log("Records returned:", records.length);
  }
} catch (error) {
  console.error("Connection failed:", error.message);
  process.exitCode = 1;
}
