# Private Chat — GitHub Pages + Firebase

Chat minimalist pentru exact doi utilizatori, cu:

- autentificare Email/Password;
- mesaje live fără refresh;
- istoric persistent în Cloud Firestore;
- ultimele 50 de mesaje încărcate la intrare;
- încărcare paginată pentru mesaje mai vechi;
- acces la baza de date doar pentru cele două UID-uri aprobate;
- interfață responsive pentru telefon și desktop;
- fără buton de înregistrare publică.

## Fișiere

- `index.html` — interfața;
- `styles.css` — designul;
- `app.js` — autentificare, realtime și istoric;
- `firebase-config.js` — configurația proiectului Firebase și cele două UID-uri;
- `firestore.rules` — regulile de securitate pentru Firestore;
- `.nojekyll` — publicare directă pe GitHub Pages.

## 1. Creează proiectul Firebase

1. Intră în Firebase Console și creează un proiect nou.
2. Rămâi pe planul **Spark** dacă vrei varianta fără costuri.
3. Din Project Overview, adaugă o aplicație **Web**.
4. Firebase îți va afișa un obiect `firebaseConfig`.
5. Copiază valorile în `firebase-config.js`.

Nu pune parolele utilizatorilor în niciun fișier al site-ului.

## 2. Activează autentificarea

1. Firebase Console → **Authentication** → **Sign-in method**.
2. Activează **Email/Password**.
3. Mergi la **Authentication → Users**.
4. Creează manual exact cele două conturi pe care vrei să le folosești.
5. Copiază UID-ul fiecărui cont.
6. În `firebase-config.js`, înlocuiește:

```js
{ uid: "PASTE_UID_USER_1", name: "User 1" }
{ uid: "PASTE_UID_USER_2", name: "User 2" }
```

cu UID-urile reale.

## 3. Creează baza Firestore

1. Firebase Console → **Firestore Database** → Create database.
2. Alege **Standard edition**.
3. Alege o regiune rezonabilă pentru cei doi utilizatori.
4. Poți porni în Production mode; regulile de mai jos vor înlocui regulile inițiale.

Nu trebuie să creezi manual colecția `messages`. Ea va fi creată automat la primul mesaj valid.

## 4. Publică regulile de securitate

1. Deschide fișierul `firestore.rules`.
2. Înlocuiește `PASTE_UID_USER_1` și `PASTE_UID_USER_2` cu aceleași UID-uri reale.
3. Firebase Console → Firestore Database → **Rules**.
4. Înlocuiește regulile existente cu conținutul fișierului.
5. Apasă **Publish**.

Aceste reguli permit citirea și trimiterea mesajelor numai celor două conturi aprobate. Editarea și ștergerea mesajelor sunt blocate.

## 5. Adaugă domeniul GitHub Pages în Firebase Authentication

După ce știi adresa GitHub Pages, de exemplu:

```text
https://NUMEUTILIZATOR.github.io/private-chat/
```

în Firebase mergi la:

**Authentication → Settings → Authorized domains → Add domain**

și adaugă doar domeniul:

```text
NUMEUTILIZATOR.github.io
```

Nu include `https://` și nici `/private-chat/`.

## 6. Publică pe GitHub Pages

1. Creează un repository public nou, de exemplu `private-chat`.
2. Urcă toate fișierele din acest folder în rădăcina repository-ului.
3. GitHub → repository → **Settings → Pages**.
4. La **Build and deployment**, alege **Deploy from a branch**.
5. Branch: `main`.
6. Folder: `/ (root)`.
7. Save.

Adresa va fi de forma:

```text
https://NUMEUTILIZATOR.github.io/private-chat/
```

## 7. Test obligatoriu

Pe dispozitivul 1:

1. intră pe site;
2. autentifică User 1;
3. trimite un mesaj.

Pe dispozitivul 2, ideal pe altă rețea:

1. intră pe aceeași adresă;
2. autentifică User 2;
3. verifică dacă mesajul apare fără refresh;
4. răspunde;
5. închide ambele browsere;
6. redeschide site-ul și verifică dacă istoricul este păstrat.

## Observații de securitate

- `firebaseConfig` din aplicația web nu este o parolă și va fi vizibil în browser; accesul este controlat de Firebase Authentication + Firestore Security Rules.
- Parolele celor doi utilizatori nu trebuie puse niciodată în GitHub sau în JavaScript.
- Repository-ul poate fi public, dar conversația nu devine publică dacă regulile Firestore sunt configurate corect.
- Nu activa reguli de forma `allow read, write: if true;`.

## Cost

Pentru doi utilizatori și un chat obișnuit, proiectul este proiectat să rămână în limitele gratuite ale planului Firebase Spark și ale GitHub Pages. Dacă depășești limitele gratuite ale serviciului Firebase, pe Spark serviciul afectat se poate opri până la resetarea cotei în loc să înceapă automat facturarea.
