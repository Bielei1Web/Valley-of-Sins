
# Valley of Sins

## Kontakte einrichten

Die Kontaktverwaltung benötigt die Migration
`supabase/migrations/20261014153000_add_contacts.sql`. Führe sie zuerst im
SQL Editor des Valley-of-Sins-Testprojekts aus. Sie erstellt die Kontakttabelle,
setzt Row-Level-Security mit den Tab-Rechten auf und gibt bestehenden Benutzern
die bisherige Standardberechtigung „Ansehen“. Bearbeiten und Löschen können
anschließend wie bei den anderen Tabs über die Benutzerverwaltung freigegeben
werden.

## Berufe einrichten

Die Berufs- und Rezeptverwaltung benötigt zusätzlich die Migration
`supabase/migrations/20261014160000_add_berufe.sql`. Führe sie im SQL Editor des
Valley-of-Sins-Testprojekts aus. Bestehende Benutzer erhalten zunächst
Ansichtsrechte; Bearbeiten und Löschen von Rezepten werden in der
Benutzerverwaltung über die Berufe-Tab-Rechte vergeben. Berufs-Untertabs
erstellen und löschen können Administratoren.
