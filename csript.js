function pobierzLokalizacje() {
    if (!navigator.geolocation) {
        document.getElementById("wynik").innerText = 
            "Twoja przeglądarka nie obsługuje geolokalizacji.";
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;

            document.getElementById("wynik").innerText =
                "Twoja lokalizacja: " + lat + ", " + lon;
        },
        (err) => {
            document.getElementById("wynik").innerText =
                "Błąd: " + err.message;
        }
    );
}
