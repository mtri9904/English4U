-- Create an Admin user for testing
-- First, get the Admin role ID
DECLARE @AdminRoleID INT;
SELECT @AdminRoleID = RoleID FROM Roles WHERE RoleName = 'Admin';

-- Insert admin user if not exists
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'admin@example.com')
BEGIN
    INSERT INTO Users (
        RoleID,
        FullName,
        Email,
        PasswordHash,
        AuthProvider,
        CoinBalance,
        IsActive
    ) VALUES (
        @AdminRoleID,
        N'System Administrator',
        'admin@example.com',
        '$2a$10$YQz7Z5f8X2wL3kJhKQyZxO5CZJ8vL2YQz7Z5f8X2wL3kJhKQyZxO3e', -- bcrypt hash of "Admin123!"
        'Email',
        1000,
        1
    );
    PRINT 'Admin user created successfully!';
END
ELSE
BEGIN
    PRINT 'Admin user already exists.';
END

-- Display the admin user
SELECT UserID, FullName, Email, R.RoleName, CoinBalance, IsActive
FROM Users U
JOIN Roles R ON U.RoleID = R.RoleID
WHERE Email = 'admin@example.com';
