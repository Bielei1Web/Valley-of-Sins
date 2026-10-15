    function renderCalculatedPricesTable() {
        const tbody = document.getElementById('calculated-prices-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const products = getCalculatedPriceProducts();
        if (products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Rezepte oder Lagerartikel vorhanden.</td></tr>`;
            return;
        }

        products.forEach(product => {
            const costPerUnit = product.recipe
                ? getRecipeCostPerUnit(product.name)
                : getLowestPurchaseCost(product.name);
            const margin = recipeMargins[product.marginKey] !== undefined ? recipeMargins[product.marginKey] : 20;
            let calculatedPrice = costPerUnit * (1 + (margin / 100));

            const isZero = product.recipe ? recipeHasZeroCost(product.name) : costPerUnit === 0;
            const costClass = isZero ? "current-cost zero-cost" : "current-cost";
            const nameColorStyle = isZero ? "color: var(--danger-color) !important;" : "color: var(--accent-blue);";

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="tooltip-container">
                        <span class="material-name" style="${nameColorStyle} border-bottom: 1px dotted currentColor;"></span>
                        <div class="tooltip-text">${getRecipeTooltipHtml(product.name)}</div>
                        <span class="calculated-price-product-meta" style="font-size: 0.85rem; color: var(--accent-green); font-weight: 600; margin-left: 8px;"></span>
                    </div>
                </td>
                <td><span class="${costClass}">$${costPerUnit.toFixed(2)}</span></td>
                <td>
                    <div class="adjust-box">
                        <input type="number" class="calculated-price-margin" value="${margin}" step="1" style="width: 90px;" /> %
                    </div>
                </td>
                <td><span class="calc-price-display current-price">$${calculatedPrice.toFixed(2)}</span></td>
                <td>
                    <button type="button" class="btn btn-success apply-calculated-price" style="height: 38px; font-size: 0.85rem;">Als Standard-VK übernehmen</button>
                </td>
            `;
            row.querySelector('.material-name').textContent = product.name;
            row.querySelector('.calculated-price-product-meta').textContent = product.recipe
                ? `(${product.recipe.outputQty} Stk. je Rezept${product.inventory ? ` · Lagerbestand: ${product.inventory.quantity} Stk.` : ''})`
                : `(Lagerbestand: ${product.inventory.quantity} Stk.)`;
            const marginInput = row.querySelector('.calculated-price-margin');
            marginInput.id = `margin-input-${product.marginKey}`;
            marginInput.addEventListener('input', () => updateCalculatedPriceRow(product.marginKey, product.name, product.recipe));
            row.querySelector('.calc-price-display').id = `calc-price-display-${product.marginKey}`;
            row.querySelector('.apply-calculated-price').addEventListener('click', () => {
                applyCalculatedPrice(product.name, product.marginKey);
            });
            tbody.appendChild(row);
        });
    }

    function getCalculatedPriceProducts() {
        const productsByName = new Map();
        (recipesList || []).forEach(recipe => {
            if (!recipe || !recipe.outputName) return;
            const name = recipe.outputName.trim();
            productsByName.set(name.toLocaleLowerCase('de'), {
                name,
                recipe,
                inventory: null,
                marginKey: recipe.id
            });
        });
        (inventoryList || []).forEach(item => {
            if (!item || !item.name) return;
            const name = item.name.trim();
            const key = name.toLocaleLowerCase('de');
            const existingProduct = productsByName.get(key);
            if (existingProduct) {
                existingProduct.inventory = item;
            } else {
                productsByName.set(key, {
                    name,
                    recipe: null,
                    inventory: item,
                    marginKey: `inventory-${item.id}`
                });
            }
        });
        return [...productsByName.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    }

    function updateCalculatedPriceRow(marginKey, itemName, recipe) {
        const marginInput = document.getElementById(`margin-input-${marginKey}`);
        const displayEl = document.getElementById(`calc-price-display-${marginKey}`);
        if (!marginInput || !displayEl) return;

        let margin = parseFloat(marginInput.value);
        if (isNaN(margin)) margin = 0;
        recipeMargins[marginKey] = margin;

        const costPerUnit = recipe ? getRecipeCostPerUnit(itemName) : getLowestPurchaseCost(itemName);
        let calculatedPrice = costPerUnit * (1 + (margin / 100));
        displayEl.innerText = `$${calculatedPrice.toFixed(2)}`;
    }

    async function applyCalculatedPrice(itemName, marginKey) {
        const displayEl = document.getElementById(`calc-price-display-${marginKey}`);
        if (!displayEl) return;
        const priceVal = parseFloat(displayEl.innerText.replace('$', ''));
        if (isNaN(priceVal)) return;

        const priceUpdated = getCurrentTimeString();
        const existing = salesPricesList.find(i => i.name.toLowerCase() === itemName.toLowerCase());

        if (existing) {
            const { error } = await supabaseClient
                .from('sales_prices')
                .update({ price: priceVal, priceUpdated })
                .eq('id', existing.id);

            if (!error) {
                existing.price = priceVal;
                existing.priceUpdated = priceUpdated;
                updateSalesPriceSearchSelect();
                logActivity('Verkaufspreis', `Verkaufspreis für "${itemName}" auf $${priceVal.toFixed(2)} aktualisiert`, `Artikel: ${itemName}\nPreis: $${priceVal.toFixed(2)}`);
                renderPriceTable();
                renderOrders();
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('sales_prices');
            }
        } else {
            const { data, error } = await supabaseClient
                .from('sales_prices')
                .insert([{ name: itemName, price: priceVal, priceUpdated }])
                .select();

            if (!error && data) {
                salesPricesList.push(data[0]);
                updateSalesPriceSearchSelect();
                logActivity('Verkaufspreis', `Verkaufspreis für "${itemName}" mit $${priceVal.toFixed(2)} neu angelegt`, `Artikel: ${itemName}\nPreis: $${priceVal.toFixed(2)}`);
                renderPriceTable();
                renderOrders();
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('sales_prices');
            }
        }
    }

    function renderPriceTable() {
        const tbody = document.getElementById('prices-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const selectEl = document.getElementById('sales-price-search');
        const selectedValue = selectEl ? selectEl.value : 'ALL';

        const discountInput = document.getElementById('global-discount-input');
        let discountPercent = discountInput ? parseFloat(discountInput.value) || 0 : 0;

        let filteredList = salesPricesList;
        if (selectedValue !== 'ALL') {
            filteredList = salesPricesList.filter(item => item.name === selectedValue);
        }

        const sortedList = [...filteredList].sort((a, b) => a.name.localeCompare(b.name, 'de'));

        if (sortedList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Standardverkaufspreise hinterlegt.</td></tr>`;
            return;
        }

        sortedList.forEach((item) => {
            const costPerUnit = getRecipeCostPerUnit(item.name);
            const isZero = recipeHasZeroCost(item.name);
            const costClass = isZero ? "current-cost zero-cost" : "current-cost";
            const nameColorStyle = isZero ? "color: var(--danger-color) !important;" : "";

            let effectivePrice = item.price * (1 - (discountPercent / 100));

            let markupText = "-%";
            let markupColor = "var(--text-muted)";

            if (costPerUnit > 0 && !isZero) {
                const markupPercent = ((effectivePrice - costPerUnit) / costPerUnit) * 100;
                markupText = `${markupPercent >= 0 ? '+' : ''}${markupPercent.toFixed(1)}%`;
                markupColor = markupPercent >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
            }

            let priceDisplayHtml = `$${effectivePrice.toFixed(2)}`;
            if (discountPercent > 0) {
                priceDisplayHtml += ` <span style="font-size: 0.75rem; text-decoration: line-through; color: var(--text-muted);">$${item.price.toFixed(2)}</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="tooltip-container">
                        <span class="material-name" style="${nameColorStyle} border-bottom: 1px dotted currentColor;">${item.name}</span>
                        <div class="tooltip-text">${getRecipeTooltipHtml(item.name)}</div>
                    </div>
                </td>
                <td><span class="${costClass}">$${costPerUnit.toFixed(2)}</span></td>
                <td class="current-price">${priceDisplayHtml}</td>
                <td><span style="font-weight: 700; color: ${markupColor};">${markupText}</span></td>
                <td>
                    <div class="adjust-box">
                        <input type="number" step="0.01" id="price-input-${item.id}" placeholder="Neuer VK ($)" min="0" />
                        <button class="btn" onclick="updatePrice(${item.id})">Bestätigen</button>
                    </div>
                </td>
                <td><button class="btn btn-danger delete-action" data-permission-action="delete" onclick="deletePriceItem(${item.id})">Löschen</button></td>
                <td class="time-text">${item.priceUpdated || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function updatePrice(id) {
        const inputEl = document.getElementById(`price-input-${id}`);
        const value = parseFloat(inputEl.value);
        if (isNaN(value) || value < 0) return alert("Gültigen Preis eingeben.");

        const priceUpdated = getCurrentTimeString();
        const { error } = await supabaseClient
            .from('sales_prices')
            .update({ price: value, priceUpdated })
            .eq('id', id);

        if (!error) {
            const item = salesPricesList.find(i => i.id === id);
            if (item) {
                const oldPrice = item.price;
                item.price = value;
                item.priceUpdated = priceUpdated;
                inputEl.value = '';
                renderPriceTable();
                renderOrders();
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('sales_prices');
                logActivity('Verkaufspreis', `Verkaufspreis von "${item.name}" geändert: $${Number(oldPrice).toFixed(2)} → $${value.toFixed(2)}`, `Artikel: ${item.name}\nPreis: $${Number(oldPrice).toFixed(2)} → $${value.toFixed(2)}`);
            }
        }
    }

    async function deletePriceItem(id) {
        if (!canDeleteTab('verkaufspreise')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Standardverkaufspreis löschen?")) {
            const item = salesPricesList.find(i => i.id === id);
            const { error } = await supabaseClient.from('sales_prices').delete().eq('id', id);
            if (!error) {
                salesPricesList = salesPricesList.filter(i => i.id !== id);
                updateSalesPriceSearchSelect();
                renderPriceTable();
                renderOrders();
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('sales_prices');
                logActivity('Verkaufspreis', `Verkaufspreis für "${item ? item.name : id}" gelöscht`, `Artikel: ${item ? item.name : id}\nPreis: $${item ? Number(item.price || 0).toFixed(2) : '0.00'}`);
            }
        }
    }

    async function handleAddPriceItem(event) {
        event.preventDefault();
        const inputEl = document.getElementById('price-add-name');
        const priceInput = document.getElementById('price-add-price');
        const name = capitalizeText(inputEl.value.trim());
        const price = parseFloat(priceInput.value);
        if (!name || isNaN(price)) return alert("Bitte Artikelnamen und Preis eingeben.");

        const priceUpdated = getCurrentTimeString();
        const existing = salesPricesList.find(i => i.name.toLowerCase() === name.toLowerCase());

        if (existing) {
            const oldPrice = existing.price;
            const { error } = await supabaseClient
                .from('sales_prices')
                .update({ price, priceUpdated })
                .eq('id', existing.id);

            if (!error) {
                existing.price = price;
                existing.priceUpdated = priceUpdated;
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('sales_prices');
                logActivity('Verkaufspreis', `Verkaufspreis von "${name}" geändert: $${Number(oldPrice).toFixed(2)} → $${price.toFixed(2)}`, `Artikel: ${name}\nPreis: $${Number(oldPrice).toFixed(2)} → $${price.toFixed(2)}`);
            }
        } else {
            const { data, error } = await supabaseClient
                .from('sales_prices')
                .insert([{ name, price, priceUpdated }])
                .select();

            if (!error && data) {
                salesPricesList.push(data[0]);
                if (typeof broadcastDataChange === 'function') await broadcastDataChange('sales_prices');
                logActivity('Verkaufspreis', `Neuer Verkaufspreis für "${name}" angelegt: $${price.toFixed(2)}`, `Artikel: ${name}\nPreis: $${price.toFixed(2)}`);
            }
        }
        inputEl.value = '';
        const selectEl = document.getElementById('price-add-select');
        if (selectEl) selectEl.value = '';
        priceInput.value = '';
        updateSalesPriceSearchSelect();
        renderPriceTable();
        renderOrders();
    }

    function updateBusinessFilterOptions() {
        const filterSelect = document.getElementById('business-filter');
        const currentSelected = filterSelect.value;
        const businesses = [...new Set(purchasePricesList.map(item => item.business))].sort((a, b) => a.localeCompare(b, 'de'));

        filterSelect.innerHTML = '<option value="ALL">Alle Gewerbe anzeigen</option>';
        businesses.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.innerText = b;
            filterSelect.appendChild(opt);
        });
        filterSelect.value = businesses.includes(currentSelected) ? currentSelected : "ALL";
    }
