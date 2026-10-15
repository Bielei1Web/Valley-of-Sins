    function getCustomerPriceSelectableItems() {
        const itemsByName = new Map();
        (recipesList || []).forEach(recipe => {
            if (!recipe || !recipe.outputName) return;
            const name = recipe.outputName.trim();
            itemsByName.set(name.toLocaleLowerCase('de'), name);
        });
        (inventoryList || []).forEach(item => {
            if (!item || !item.name) return;
            const name = item.name.trim();
            const key = name.toLocaleLowerCase('de');
            if (!itemsByName.has(key)) itemsByName.set(key, name);
        });
        return [...itemsByName.values()].sort((a, b) => a.localeCompare(b, 'de'));
    }

    function updateCustomerPricesRecipeSelect() {
        const selects = document.querySelectorAll('.cust-price-name-select');
        const items = getCustomerPriceSelectableItems();

        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '-- Artikel aus Rezepten / Lager auswählen --';
            placeholder.selected = !currentValue;
            select.appendChild(placeholder);
            items.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                if (name === currentValue) opt.selected = true;
                select.appendChild(opt);
            });
        });
    }

    function initCustomerPricePositionInputs() {
        const container = document.getElementById('customer-price-items-container');
        if (!container) return;
        container.innerHTML = '';
        addCustomerPricePositionInput();
    }

    function addCustomerPricePositionInput(defaultName = "", defaultPrice = "") {
        const container = document.getElementById('customer-price-items-container');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'cust-price-item-row';
        div.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
        
        const items = getCustomerPriceSelectableItems();
        let optionsHtml = '<option value="">-- Artikel aus Rezepten / Lager auswählen --</option>';
        items.forEach(name => {
            const escapedName = escapeHtml(name);
            const isSelected = name.toLocaleLowerCase('de') === defaultName.toLocaleLowerCase('de') ? 'selected' : '';
            optionsHtml += `<option value="${escapedName}" ${isSelected}>${escapedName}</option>`;
        });

        div.innerHTML = `
            <input type="text" class="cust-price-name-input" value="${escapeHtml(defaultName)}" placeholder="Artikel manuell eintragen..." oninput="handleCustPriceTextInput(this)" required style="flex:2;" />
            <select class="cust-price-name-select" onchange="handleCustPriceRecipeSelectChange(this)" aria-label="Artikel aus Rezepten oder Lager auswählen" style="flex:2;">
                ${optionsHtml}
            </select>
            <input type="number" step="0.01" class="cust-price-val-input" placeholder="Preis ($)" min="0" value="${defaultPrice}" required style="flex:1; max-width: 130px;" />
            <button type="button" class="btn btn-danger" onclick="this.parentElement.remove()" style="height: 40px;">✕</button>
        `;
        container.appendChild(div);
    }

    function handleCustPriceRecipeSelectChange(selectEl) {
        const row = selectEl.closest('.cust-price-item-row');
        if (!row) return;
        const nameInput = row.querySelector('.cust-price-name-input');
        const priceInput = row.querySelector('.cust-price-val-input');
        if (nameInput && selectEl.value) nameInput.value = selectEl.value;
        if (priceInput && selectEl.value) {
            const found = (salesPricesList || []).find(sp => sp.name.toLowerCase() === selectEl.value.toLowerCase());
            if (found) {
                priceInput.value = found.price.toFixed(2);
            }
        }
    }

    function handleCustPriceTextInput(inputEl) {
        const row = inputEl.closest('.cust-price-item-row');
        if (!row) return;
        const select = row.querySelector('.cust-price-name-select');
        if (!select) return;
        const matchingOption = [...select.options].find(option =>
            option.value.toLocaleLowerCase('de') === inputEl.value.trim().toLocaleLowerCase('de')
        );
        select.value = matchingOption ? matchingOption.value : '';
    }

    function renderCustomerPricesTable() {
        const tbody = document.getElementById('customer-prices-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const selectedCustomerFilter = document.getElementById('customer-filter').value;
        const selectedBusinessFilter = document.getElementById('customer-business-filter').value;

        let filteredList = customerPricesList;
        if (selectedCustomerFilter !== "ALL") {
            filteredList = filteredList.filter(item => item.customerName === selectedCustomerFilter);
        }
        if (selectedBusinessFilter !== "ALL") {
            filteredList = filteredList.filter(item => item.business === selectedBusinessFilter);
        }

        const sortedList = [...filteredList].sort((a, b) => b.id - a.id);

        if (sortedList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Kundenpreise gefunden.</td></tr>`;
            return;
        }

        sortedList.forEach(item => {
            const hasRecipe = (recipesList || []).some(recipe =>
                recipe.outputName && recipe.outputName.toLocaleLowerCase('de') === String(item.name).toLocaleLowerCase('de')
            );
            const costPerUnit = hasRecipe
                ? Number(getRecipeCostPerUnit(item.name)) || 0
                : Number(getLowestPurchaseCost(item.name)) || 0;
            const costClass = costPerUnit === 0 ? "current-cost zero-cost" : "current-cost";
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="business-badge">${item.customerName || '-'}</span></td>
                <td><span class="business-badge" style="background-color: var(--secondary-btn-bg); color: var(--accent-blue);">${item.business || '-'}</span></td>
                <td class="material-name">
                    <div class="tooltip-container">
                        <span style="border-bottom: 1px dotted var(--accent-gray);">${item.name}</span>
                        <div class="tooltip-text">${getRecipeTooltipHtml(item.name)}</div>
                    </div>
                </td>
                <td><span class="${costClass}">$${costPerUnit.toFixed(2)}</span></td>
                <td class="current-price">$${item.price.toFixed(2)}</td>
                <td>
                    <div class="adjust-box">
                        <input type="number" step="0.01" id="cust-price-input-${item.id}" placeholder="Preis ($)" min="0" style="width: 130px;" />
                        <button class="btn" onclick="updateCustomerPrice(${item.id})">Speichern</button>
                    </div>
                </td>
                <td><button class="btn btn-danger delete-action" data-permission-action="delete" onclick="deleteCustomerPrice(${item.id})">Löschen</button></td>
                <td class="time-text">${item.priceUpdated || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function updateCustomerPrice(id) {
        const inputEl = document.getElementById(`cust-price-input-${id}`);
        const val = parseFloat(inputEl.value);

        const item = customerPricesList.find(i => i.id === id);
        if (item) {
            if (!isNaN(val) && val >= 0) {
                const priceUpdated = getCurrentTimeString();
                const oldPrice = item.price;
                const updatePayload = { price: val, priceUpdated };

                const { error } = await supabaseClient
                    .from('customer_prices')
                    .update(updatePayload)
                    .eq('id', id);

                if (!error) {
                    item.price = val;
                    item.priceUpdated = priceUpdated;
                    inputEl.value = '';
                    renderCustomerPricesTable();
                    renderOrders();
                    if (typeof broadcastDataChange === 'function') await broadcastDataChange('customer_prices');
                    logActivity('Kundenpreis', `Preis für "${item.name}" bei Kunde "${item.customerName}" geändert: $${Number(oldPrice).toFixed(2)} → $${val.toFixed(2)}`, `Kunde: ${item.customerName}\nArtikel: ${item.name}\nPreis: $${Number(oldPrice).toFixed(2)} → $${val.toFixed(2)}`);
                } else {
                    alert("Fehler beim Aktualisieren: " + error.message);
                }
            } else {
                alert("Bitte einen gültigen Preis eingeben.");
            }
        }
    }

    async function deleteCustomerPrice(id) {
        if (!canDeleteTab('kunden')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Kundenpreis wirklich löschen?")) {
            const item = customerPricesList.find(i => i.id === id);
            const { error } = await supabaseClient.from('customer_prices').delete().eq('id', id);
            if (!error) {
                customerPricesList = customerPricesList.filter(i => i.id !== id);
                updateCustomerFilterOptions();
                updateOrderCustomerDropdown();
                renderCustomerPricesTable();
                renderOrders();
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('customer_prices');
                logActivity('Kundenpreis', `Kundenpreis für "${item ? item.name : id}" bei "${item ? item.customerName : '?'}" gelöscht`, `Kunde: ${item ? item.customerName : '?'}\nArtikel: ${item ? item.name : id}\nPreis: $${item ? Number(item.price || 0).toFixed(2) : '0.00'}`);
            }
        }
    }

    async function handleAddCustomerPrice(event) {
        event.preventDefault();
        const custInput = document.getElementById('cust-price-name');
        const businessInput = document.getElementById('cust-price-business');

        const customerName = capitalizeText(custInput.value.trim());
        const business = capitalizeText(businessInput.value.trim());

        if (!customerName) return alert("Bitte einen Kundennamen angeben.");

        const rows = document.querySelectorAll('.cust-price-item-row');
        if (rows.length === 0) return alert("Bitte mindestens einen Artikel angeben.");

        const priceUpdated = getCurrentTimeString();
        let successCount = 0;

        for (const row of rows) {
            const nameInput = row.querySelector('.cust-price-name-input');
            const valInput = row.querySelector('.cust-price-val-input');
            if (!nameInput || !valInput) continue;

            const name = capitalizeText(nameInput.value.trim());
            const price = parseFloat(valInput.value);

            if (!name || isNaN(price) || price < 0) {
                alert("Bitte für jede Position einen Artikel und einen gültigen Sonderpreis ab 0 eingeben.");
                return;
            }

            const existing = customerPricesList.find(i => (i.customerName || "").toLowerCase() === customerName.toLowerCase() && i.name.toLowerCase() === name.toLowerCase());

            if (existing) {
                const { error } = await supabaseClient
                    .from('customer_prices')
                    .update({ price, business, priceUpdated })
                    .eq('id', existing.id);

                if (!error) {
                    existing.price = price;
                    existing.business = business;
                    existing.priceUpdated = priceUpdated;
                    if (typeof broadcastDataChange === 'function') await broadcastDataChange('customer_prices');
                    successCount++;
                }
            } else {
                const { data, error } = await supabaseClient
                    .from('customer_prices')
                    .insert([{ customerName, business, name, price, priceUpdated }])
                    .select();

                if (!error && data) {
                    customerPricesList.push(data[0]);
                    if (typeof broadcastDataChange === 'function') await broadcastDataChange('customer_prices');
                    successCount++;
                }
            }
        }

        if (successCount > 0) {
            custInput.value = '';
            businessInput.value = '';
            initCustomerPricePositionInputs();
            updateCustomerFilterOptions();
            updateOrderCustomerDropdown();
            renderCustomerPricesTable();
            renderOrders();
            logActivity('Kundenpreis', `Kundenspezifische Preise für "${customerName}" gespeichert (${successCount} Artikel)`, `Kunde: ${customerName}\nGeschäft: ${business || '-'}\nArtikel: ${successCount}`);
        } else {
            alert("Fehler beim Speichern der Kundenpreise.");
        }
    }

    function updateSalesPriceRecipeDropdown() {
		const hideCheckbox = document.getElementById('sales-price-hide-existing-checkbox');
        const selectEl = document.getElementById('price-add-select');
        if (!selectEl) return;
        const currentSelected = selectEl.value;
		
        const existingNames = new Set(salesPricesList.map(sp => sp.name.toLowerCase()));

        const itemsByName = new Map();
        [...recipesList]
            .filter(recipe => recipe && recipe.outputName)
            .forEach(recipe => itemsByName.set(recipe.outputName.trim().toLocaleLowerCase('de'), recipe.outputName.trim()));
        [...inventoryList]
            .filter(item => item && item.name)
            .forEach(item => {
                const key = item.name.trim().toLocaleLowerCase('de');
                if (!itemsByName.has(key)) itemsByName.set(key, item.name.trim());
            });
        let sortedItems = [...itemsByName.values()].sort((a, b) => a.localeCompare(b, 'de'));

        if (hideCheckbox && hideCheckbox.checked) {
            sortedItems = sortedItems.filter(name => !existingNames.has(name.toLowerCase()));
        }
		
        selectEl.innerHTML = '<option value="">-- Kein Artikel gewählt --</option>';
        sortedItems.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.innerText = name;
            selectEl.appendChild(opt);
        });
        selectEl.value = sortedItems.includes(currentSelected) ? currentSelected : "";
    }

    function handleSalesPriceSelectChange() {
        const selectEl = document.getElementById('price-add-select');
        const inputEl = document.getElementById('price-add-name');
        if (selectEl && inputEl && selectEl.value) {
            inputEl.value = selectEl.value;
        }
    }

    function handleSalesPriceTextInput() {
        const selectEl = document.getElementById('price-add-select');
        const inputEl = document.getElementById('price-add-name');
        if (selectEl && inputEl) {
            const typedVal = inputEl.value.trim().toLowerCase();
            const matchingOption = [...selectEl.options].find(opt => opt.value.toLowerCase() === typedVal);
            if (matchingOption) {
                selectEl.value = matchingOption.value;
            } else {
                selectEl.value = "";
            }
        }
    }
