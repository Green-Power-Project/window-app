# Customer Portal (Window-App) – Translatable Strings List

All strings that should be translated across the customer panel screens, with **suggested i18n key** and **English (EN)** / **German (DE)** values.  
No code—list and translations only.  
Keys that already exist in `locales/en/common.json` or `locales/de/common.json` are marked with *(existing)*.

---

## 1. Shared (Header, Sidebar, Every Screen)

| Suggested key | English (EN) | German (DE) |
|---------------|--------------|-------------|
| `navigation.customerPortal` *(existing)* | Customer Portal | Kundenportal |
| `navigation.dashboard` *(existing)* | Dashboard | Dashboard |
| `navigation.profile` *(existing)* | Profile | Profil |
| (context: user role) | Customer | Kunde |
| `common.signOut` *(add if missing)* | Sign out | Abmelden |
| `dashboard.myProjectsSection` *(add)* | MY PROJECTS | MEINE PROJEKTE |
| `dashboard.year` *(existing)* | Year | Jahr |
| `profile.customerAccount` *(existing)* | Customer Account | Kundenkonto |

---

## 2. Dashboard (My Projects)

| Suggested key | English (EN) | German (DE) |
|---------------|--------------|-------------|
| `dashboard.title` *(existing)* | Dashboard | Dashboard |
| `dashboard.myProjects` *(existing)* | My Projects | Meine Projekte |
| `dashboard.description` *(existing)* | Select a project to view details | Wählen Sie ein Projekt aus, um Details anzuzeigen |
| `dashboard.viewProject` *(existing)* | View project → | Projekt anzeigen → |
| `dashboard.year` *(existing)* | Year | Jahr |
| (project name, e.g. "Solar Installation") | (from data) | (from data) |
| (e.g. "Jahr: 2025") | Year: {{year}} | Jahr: {{year}} |

---

## 3. Project Folder Overview (Project detail – folder cards)

| Suggested key | English (EN) | German (DE) |
|---------------|--------------|-------------|
| `common.back` *(existing)* | Back | Zurück |
| (breadcrumb) | &lt; Back Dashboard | &lt; Zurück Dashboard |
| `folders.01_Customer_Uploads` *(existing)* | Your Uploads | Ihre Uploads |
| `status.unread` *(existing)* | Unread | Ungelesen |
| (unread count tag) | 1 Unread / 5 Unread | 1 Ungelesen / 5 Ungelesen |
| `folders.03_Reports` *(existing)* | Reports | Berichte |
| `folders.05_Quotations` *(existing)* | Quotations | Angebote |
| `folders.06_Invoices` *(existing)* | Invoices | Rechnungen |
| `folders.07_Delivery_Notes` *(existing)* | Delivery Notes | Lieferscheine |
| `folders.08_General` *(existing)* | General | Allgemein |
| `folders.02_Photos` *(existing)* | Photos | Photos |
| `folders.04_Emails` *(existing)* | Emails | E-Mails |
| (folder description keys) | *(existing under folders.*.description)* | *(existing)* |

---

## 4. Folder View (Files list + upload – e.g. Your Uploads > Photos)

| Suggested key | English (EN) | German (DE) |
|---------------|--------------|-------------|
| `common.back` *(existing)* | Back | Zurück |
| (breadcrumb) | &lt; Back Solar Installation | &lt; Zurück {{projectName}} |
| `folders.01_Customer_Uploads` *(existing)* | Your Uploads | Ihre Uploads |
| `folders.01_Customer_Uploads/Photos` *(existing)* | Photos | Fotos |
| (file count) | {{count}} files | {{count}} Dateien |
| `projects.uploadFile` *(existing)* | Upload File | Datei hochladen |
| `projects.fileTypesAndSize` *(existing)* | PDF, JPG, PNG up to 20MB | PDF, JPG, PNG bis zu 20 MB |
| `projects.clickToUpload` *(existing)* | Click to upload | Zum Hochladen klicken |
| `projects.orDragAndDrop` *(existing)* | or drag and drop | oder per Drag & Drop |
| (combined) | Click to upload or drag and drop | Zum Hochladen klicken oder per Drag & Drop |
| `projects.files` *(existing)* | Files | Dateien |
| `common.delete` *(existing)* | Delete | Löschen |
| `common.download` *(existing)* | Download | Herunterladen |
| (file type labels) | IMAGE / PDF | IMAGE / PDF (or leave as-is) |

---

## 5. Profile Settings

| Suggested key | English (EN) | German (DE) |
|---------------|--------------|-------------|
| `profile.title` *(existing)* | Profile Settings | Profileinstellungen |
| `profile.description` *(existing)* | Manage your account information and security settings | Verwalten Sie Ihre Kontoinformationen und Sicherheitseinstellungen |
| `profile.language` *(existing)* | Language | Sprache |
| `profile.languageDescription` *(existing)* | Choose your preferred language | Wählen Sie Ihre bevorzugte Sprache |
| `profile.german` *(existing)* | Deutsch | Deutsch |
| `profile.english` *(existing)* | English | Englisch |
| `profile.nameSection` *(existing)* | Personal Information | Persönliche Informationen |
| `profile.name` *(existing)* | Name | Name |
| `profile.enterFullName` *(existing)* | Enter your full name | Geben Sie Ihren vollständigen Namen ein |
| `profile.nameDescription` *(existing)* | Update your display name | Aktualisieren Sie Ihren Anzeigenamen |
| `profile.mobileNumber` *(existing)* | Mobile Number | Handynummer |
| `profile.enterMobileNumber` *(existing)* | Enter your mobile number | Geben Sie Ihre Handynummer ein |
| (placeholder) | e.g., +1234567890 | z.B. +1234567890 |
| (context: right panel) | Account Info | Kontoinformationen |
| `profile.customerNumber` *(existing)* | Customer Number | Kundennummer |
| (context) | ACCOUNT STATUS | Kontostatus |
| `profile.enabled` *(existing)* | Enabled | Aktiviert |
| `profile.accountStatusNote` *(add)* | Account status can only be changed by administrator | Kontostatus kann nur vom Administrator geändert werden |

---

## 6. Summary by Screen

- **Shared:** Customer Portal, Dashboard, Profile, Customer (role), Sign out, MY PROJECTS, Year, Customer Account.
- **Dashboard:** My Projects, Select a project to view details, View project →, Year (with value).
- **Project overview:** Back, folder names (Your Uploads, Reports, Quotations, Invoices, Delivery Notes, General, Photos, Emails), Unread count tag (e.g. 1 Ungelesen).
- **Folder / files view:** Back, breadcrumb (Your Uploads > Photos), X files, Upload File, file type/size hint, Click to upload or drag and drop, Files section header, Delete, Download.
- **Profile:** Profile Settings, description, Language, Choose your preferred language, Deutsch/English, Personal Information, Name, Enter full name, Update display name, Mobile number, placeholder, Account Info, Customer Number, Account Status, Enabled, note about admin-only status change.

---

## 7. Keys to add (if not present)

- `common.signOut` → "Sign out" / "Abmelden"
- `dashboard.myProjectsSection` → "MY PROJECTS" / "MEINE PROJEKTE" (for sidebar section header)
- `profile.accountStatusNote` → "Account status can only be changed by administrator" / "Kontostatus kann nur vom Administrator geändert werden"

Use this list to add or align keys in `window-app/locales/en/common.json` and `window-app/locales/de/common.json`. Many keys already exist from current i18n setup.
