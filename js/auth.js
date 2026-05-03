console.log("AUTH JS LOADED");
document.addEventListener("DOMContentLoaded", function () {

    const loginForm = document.getElementById("loginForm");

    if (loginForm) {
        loginForm.addEventListener("submit", function (e) {
            e.preventDefault();

            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;

            console.log("Login clicked"); // debug

            fetch("http://localhost:3000/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error("Server not responding");
                }
                return response.json();
            })
            .then(data => {
                console.log(data); // debug

                if (data.success) {
                    alert("Login Successful");
                    window.location.href = "dashboard.html";
                } else {
                    alert("User not found. Please register.");
                }
            })
            .catch(error => {
                console.error("Error:", error);
                alert("Cannot connect to server. Check backend.");
            });
        });
    }

});