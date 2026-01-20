const response = await fetch('http://localhost:3001/api/auth/register', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        Email: 'test@example.com',
        Password: 'Test123!',
        FullName: 'Test User'
    })
});

const data = await response.json();
console.log('Registration Response:', data);
return data;
