(() => {
    const panel = document.getElementById('quick-calculator-panel');
    const toggleButton = document.getElementById('quick-calculator-toggle');
    const display = document.getElementById('quick-calculator-display');
    const errorElement = document.getElementById('quick-calculator-error');
    if (!panel || !toggleButton || !display || !errorElement) return;

    let expression = '';
    let resultShown = false;

    function renderDisplay(value = expression || '0') {
        display.textContent = value;
    }

    function setError(message = '') {
        errorElement.textContent = message;
    }

    function toggleQuickCalculator() {
        if (panel.hidden) {
            panel.hidden = false;
            toggleButton.setAttribute('aria-expanded', 'true');
        } else {
            closeQuickCalculator();
        }
    }

    function closeQuickCalculator() {
        panel.hidden = true;
        toggleButton.setAttribute('aria-expanded', 'false');
    }

    function clearCalculator() {
        expression = '';
        resultShown = false;
        setError();
        renderDisplay();
    }

    function appendCalculatorValue(value) {
        if (resultShown && /[\d.(]/.test(value)) expression = '';
        const currentNumber = expression.match(/(?:^|[+\-*/(])(-?\d*\.?\d*)$/);
        if (value === '.' && currentNumber && currentNumber[1].includes('.')) return;
        resultShown = false;
        expression += value === ',' ? '.' : value;
        setError();
        renderDisplay();
    }

    function updateLastNumber(transform) {
        const match = expression.match(/\d*\.?\d+$/);
        if (!match) return false;
        const value = Number(match[0]);
        if (!Number.isFinite(value)) return false;
        expression = expression.slice(0, match.index) + transform(value);
        return true;
    }

    function applyCalculatorPercent() {
        if (!updateLastNumber(value => String(value / 100))) {
            setError('Gib zuerst eine Zahl ein.');
            return;
        }
        resultShown = false;
        setError();
        renderDisplay();
    }

    function toggleCalculatorSign() {
        if (resultShown) resultShown = false;
        const match = expression.match(/\d*\.?\d+$/);
        if (!match) {
            if (!expression) expression = '-';
            else if (expression.endsWith('--')) expression = expression.slice(0, -1);
            else if (/[+\-*/(]$/.test(expression)) expression += '-';
            setError();
            renderDisplay();
            return;
        }

        const numberStart = match.index;
        const signIndex = numberStart - 1;
        const previousOperatorIndex = signIndex - 1;
        const hasUnaryMinus = expression[signIndex] === '-' &&
            (signIndex === 0 || /[+\-*/(]/.test(expression[previousOperatorIndex]));
        expression = hasUnaryMinus
            ? expression.slice(0, signIndex) + expression.slice(numberStart)
            : expression.slice(0, numberStart) + '-' + expression.slice(numberStart);
        setError();
        renderDisplay();
    }

    function backspaceCalculator() {
        if (resultShown) {
            clearCalculator();
            return;
        }
        expression = expression.slice(0, -1);
        setError();
        renderDisplay();
    }

    function evaluateCalculatorExpression(source) {
        const tokens = source.match(/\d+(?:\.\d*)?|\.\d+|[()+\-*/]/g);
        if (!tokens || tokens.join('') !== source.replace(/\s+/g, '')) {
            throw new Error('Ungültige Eingabe');
        }

        let index = 0;
        const parseExpression = () => {
            let value = parseTerm();
            while (tokens[index] === '+' || tokens[index] === '-') {
                const operator = tokens[index++];
                const right = parseTerm();
                value = operator === '+' ? value + right : value - right;
            }
            return value;
        };
        const parseTerm = () => {
            let value = parseUnary();
            while (tokens[index] === '*' || tokens[index] === '/') {
                const operator = tokens[index++];
                const right = parseUnary();
                if (operator === '/' && right === 0) throw new Error('Division durch 0 ist nicht möglich');
                value = operator === '*' ? value * right : value / right;
            }
            return value;
        };
        const parseUnary = () => {
            if (tokens[index] === '+') {
                index++;
                return parseUnary();
            }
            if (tokens[index] === '-') {
                index++;
                return -parseUnary();
            }
            return parsePrimary();
        };
        const parsePrimary = () => {
            const token = tokens[index++];
            if (token === '(') {
                const value = parseExpression();
                if (tokens[index++] !== ')') throw new Error('Klammer nicht geschlossen');
                return value;
            }
            const value = Number(token);
            if (!Number.isFinite(value)) throw new Error('Ungültige Eingabe');
            return value;
        };

        const value = parseExpression();
        if (index !== tokens.length) throw new Error('Ungültige Eingabe');
        if (!Number.isFinite(value)) throw new Error('Ergebnis ist zu groß');
        return value;
    }

    function calculate() {
        if (!expression) return;
        try {
            const result = evaluateCalculatorExpression(expression);
            expression = String(Number(result.toPrecision(12)));
            resultShown = true;
            setError();
            renderDisplay(`${expression.replace('.', ',')} =`);
        } catch (error) {
            setError(error.message);
        }
    }

    panel.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.calculatorAction === 'clear') clearCalculator();
        else if (button.dataset.calculatorAction === 'backspace') backspaceCalculator();
        else if (button.dataset.calculatorAction === 'calculate') calculate();
        else if (button.dataset.calculatorAction === 'percent') applyCalculatorPercent();
        else if (button.dataset.calculatorAction === 'sign') toggleCalculatorSign();
        else if (button.dataset.calculatorValue) appendCalculatorValue(button.dataset.calculatorValue);
    });

    document.addEventListener('click', event => {
        if (panel.hidden || panel.contains(event.target) || toggleButton.contains(event.target)) return;
        closeQuickCalculator();
    });

    document.addEventListener('keydown', event => {
        if (panel.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
        const target = event.target;
        if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
        if (/^[\d+\-*/.,%]$/.test(event.key)) {
            event.preventDefault();
            if (event.key === '%') applyCalculatorPercent();
            else appendCalculatorValue(event.key);
        } else if (event.key === 'F9') {
            event.preventDefault();
            toggleCalculatorSign();
        } else if (event.key === 'Enter' || event.key === '=') {
            event.preventDefault();
            calculate();
        } else if (event.key === 'Backspace') {
            event.preventDefault();
            backspaceCalculator();
        } else if (event.key === 'Delete') {
            event.preventDefault();
            clearCalculator();
        } else if (event.key === 'Escape') {
            closeQuickCalculator();
        }
    });

    window.toggleQuickCalculator = toggleQuickCalculator;
    window.closeQuickCalculator = closeQuickCalculator;
})();
