-- Seed initial data for English Learning Platform

-- Insert Roles
IF NOT EXISTS (SELECT 1 FROM Roles WHERE RoleName = 'Student')
    INSERT INTO Roles (RoleName, Description) VALUES ('Student', 'Regular student user');

IF NOT EXISTS (SELECT 1 FROM Roles WHERE RoleName = 'Teacher')
    INSERT INTO Roles (RoleName, Description) VALUES ('Teacher', 'Teacher who can grade assignments');

IF NOT EXISTS (SELECT 1 FROM Roles WHERE RoleName = 'Admin')
    INSERT INTO Roles (RoleName, Description) VALUES ('Admin', 'Administrator with full access');

-- Insert Levels
IF NOT EXISTS (SELECT 1 FROM Levels WHERE LevelName = 'A1')
    INSERT INTO Levels (LevelName, Description) VALUES ('A1', N'Beginner - Basic understanding');

IF NOT EXISTS (SELECT 1 FROM Levels WHERE LevelName = 'A2')
    INSERT INTO Levels (LevelName, Description) VALUES ('A2', N'Elementary - Can understand frequently used expressions');

IF NOT EXISTS (SELECT 1 FROM Levels WHERE LevelName = 'B1')
    INSERT INTO Levels (LevelName, Description) VALUES ('B1', N'Intermediate - Can handle main points on familiar topics');

IF NOT EXISTS (SELECT 1 FROM Levels WHERE LevelName = 'B2')
    INSERT INTO Levels (LevelName, Description) VALUES ('B2', N'Upper Intermediate - Can interact with fluency');

IF NOT EXISTS (SELECT 1 FROM Levels WHERE LevelName = 'C1')
    INSERT INTO Levels (LevelName, Description) VALUES ('C1', N'Advanced - Can use language flexibly');

IF NOT EXISTS (SELECT 1 FROM Levels WHERE LevelName = 'C2')
    INSERT INTO Levels (LevelName, Description) VALUES ('C2', N'Proficiency - Near-native fluency');

PRINT 'Seed data inserted successfully!';
