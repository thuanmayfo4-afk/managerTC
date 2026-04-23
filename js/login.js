const supabaseClient = window.supabaseClient;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Login error:', error);
      alert(`Login failed: ${error.message} (Status: ${error.status || 'unknown'})`);
    } else {
      window.location.href = "index.html";
    }
  });
});