(() => {
    let contacts = [];
    const CONTACT_FIELDS = 'id, first_name, last_name, nickname, notes, telegram_number';

    function reportContactError(message, error) {
        console.error(message, error);
        const detail = error && error.message ? error.message : String(error || '');
        showToast(`${message} ${detail}`.trim(), 'danger');
    }

    function showContactsMessage(message) {
        const body = document.getElementById('contacts-table-body');
        if (!body) return;
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = message;
        cell.style.color = 'var(--text-muted)';
        row.appendChild(cell);
        body.replaceChildren(row);
    }

    function sortContacts() {
        contacts.sort((a, b) =>
            (a.last_name || a.nickname || a.first_name || '').localeCompare(b.last_name || b.nickname || b.first_name || '', 'de')
            || (a.first_name || '').localeCompare(b.first_name || '', 'de')
        );
    }

    async function loadContacts() {
        if (!canViewTab('kontakte')) return;
        const formDetails = document.getElementById('contact-form-details');
        if (formDetails) formDetails.hidden = !canEditTab('kontakte');

        try {
            const { data, error } = await supabaseClient
                .from('contacts')
                .select(CONTACT_FIELDS)
                .order('last_name', { ascending: true })
                .order('first_name', { ascending: true });
            if (error) throw error;

            contacts = data || [];
            sortContacts();
            renderContacts();
        } catch (error) {
            showContactsMessage('Kontakte konnten nicht geladen werden.');
            reportContactError('Kontakte konnten nicht geladen werden.', error);
        }
    }

    function createContactCell(value) {
        const cell = document.createElement('td');
        cell.textContent = value || '–';
        return cell;
    }

    function renderContacts() {
        const body = document.getElementById('contacts-table-body');
        if (!body) return;
        const formDetails = document.getElementById('contact-form-details');
        if (formDetails) formDetails.hidden = !canEditTab('kontakte');

        body.replaceChildren();
        if (!contacts.length) {
            showContactsMessage('Noch keine Kontakte vorhanden.');
            return;
        }

        contacts.forEach(contact => {
            const row = document.createElement('tr');
            const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.nickname || '–';
            row.appendChild(createContactCell(fullName));
            row.appendChild(createContactCell(contact.nickname));
            row.appendChild(createContactCell(contact.telegram_number));

            const notesCell = createContactCell(contact.notes);
            notesCell.style.whiteSpace = 'pre-wrap';
            row.appendChild(notesCell);

            const actionsCell = document.createElement('td');
            if (canEditTab('kontakte')) {
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'btn btn-secondary';
                editButton.textContent = 'Bearbeiten';
                editButton.addEventListener('click', () => editContact(contact.id));
                actionsCell.appendChild(editButton);
            }
            if (canDeleteTab('kontakte')) {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'btn delete-action';
                deleteButton.dataset.permissionAction = 'delete';
                deleteButton.textContent = 'Löschen';
                deleteButton.style.marginLeft = '6px';
                deleteButton.addEventListener('click', () => deleteContact(contact.id));
                actionsCell.appendChild(deleteButton);
            }
            row.appendChild(actionsCell);
            body.appendChild(row);
        });
    }

    function editContact(id) {
        if (!canEditTab('kontakte')) {
            showToast('Du hast für diesen Tab keine Bearbeitungsrechte.', 'danger');
            return;
        }
        const contact = contacts.find(item => String(item.id) === String(id));
        if (!contact) return;

        document.getElementById('contact-edit-id').value = contact.id;
        document.getElementById('contact-first-name').value = contact.first_name || '';
        document.getElementById('contact-last-name').value = contact.last_name || '';
        document.getElementById('contact-nickname').value = contact.nickname || '';
        document.getElementById('contact-telegram').value = contact.telegram_number || '';
        document.getElementById('contact-notes').value = contact.notes || '';
        document.getElementById('contact-form-title').textContent = 'Kontakt bearbeiten';
        document.getElementById('contact-form-summary').textContent = 'Kontakt bearbeiten';
        document.getElementById('contact-submit-btn').textContent = 'Änderungen speichern';
        document.getElementById('contact-cancel-btn').hidden = false;
        document.getElementById('contact-form-details').open = true;
        document.getElementById('contact-first-name').focus();
    }

    async function saveContact(event) {
        event.preventDefault();
        if (!canEditTab('kontakte')) {
            showToast('Du hast für diesen Tab keine Bearbeitungsrechte.', 'danger');
            return;
        }

        const contactId = document.getElementById('contact-edit-id').value;
        const values = {
            first_name: document.getElementById('contact-first-name').value.trim() || null,
            last_name: document.getElementById('contact-last-name').value.trim() || null,
            nickname: document.getElementById('contact-nickname').value.trim() || null,
            telegram_number: document.getElementById('contact-telegram').value.trim() || null,
            notes: document.getElementById('contact-notes').value.trim() || null
        };
        if (!values.first_name && !values.last_name && !values.nickname) {
            showToast('Bitte mindestens Vorname, Nachname oder Spitzname eingeben.', 'danger');
            return;
        }

        try {
            const request = contactId
                ? supabaseClient.from('contacts').update(values).eq('id', contactId).select(CONTACT_FIELDS).single()
                : supabaseClient.from('contacts').insert(values).select(CONTACT_FIELDS).single();
            const { data, error } = await request;
            if (error) throw error;

            if (contactId) {
                contacts = contacts.map(contact => String(contact.id) === String(contactId) ? data : contact);
                showToast('Kontakt wurde aktualisiert.', 'success');
            } else {
                contacts.push(data);
                showToast('Kontakt wurde hinzugefügt.', 'success');
            }
            sortContacts();
            renderContacts();
            resetContactForm();
            await broadcastDataChange('contacts');
        } catch (error) {
            reportContactError('Kontakt konnte nicht gespeichert werden.', error);
        }
    }

    async function deleteContact(id) {
        if (!canDeleteTab('kontakte')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger');
            return;
        }
        const contact = contacts.find(item => String(item.id) === String(id));
        const contactName = [contact && contact.first_name, contact && contact.last_name].filter(Boolean).join(' ')
            || (contact && contact.nickname) || id;
        if (!contact || !confirm(`Kontakt „${contactName}“ wirklich löschen?`)) return;

        try {
            const { data, error } = await supabaseClient.from('contacts')
                .delete()
                .eq('id', id)
                .select('id')
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('Der Kontakt wurde nicht gefunden oder es fehlen die Löschrechte.');

            contacts = contacts.filter(item => String(item.id) !== String(id));
            renderContacts();
            showToast('Kontakt wurde gelöscht.', 'success');
            await broadcastDataChange('contacts');
        } catch (error) {
            reportContactError('Kontakt konnte nicht gelöscht werden.', error);
        }
    }

    function resetContactForm() {
        document.getElementById('contact-form').reset();
        document.getElementById('contact-edit-id').value = '';
        document.getElementById('contact-form-title').textContent = '+ Kontakt hinzufügen';
        document.getElementById('contact-form-summary').textContent = '+ Kontakt hinzufügen';
        document.getElementById('contact-submit-btn').textContent = 'Kontakt speichern';
        document.getElementById('contact-cancel-btn').hidden = true;
    }

    window.loadContacts = loadContacts;
    window.renderContacts = renderContacts;
    window.saveContact = saveContact;
    window.cancelContactEdit = resetContactForm;
})();
