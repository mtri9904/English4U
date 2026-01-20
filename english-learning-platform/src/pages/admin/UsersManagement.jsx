import React, { useEffect, useState } from 'react';
import { Edit, Check, X, UserCheck, UserX } from 'lucide-react';
import { adminService } from '../../services/api.service';
import toast from 'react-hot-toast';

const UsersManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [editingUser, setEditingUser] = useState(null);
    const [newRole, setNewRole] = useState('');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const data = await adminService.getAllUsers();
            setUsers(data);
        } catch (error) {
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateRole = async (userId) => {
        try {
            await adminService.updateUserRole(userId, newRole);
            toast.success('User role updated successfully');
            setEditingUser(null);
            loadUsers();
        } catch (error) {
            toast.error('Failed to update user role');
        }
    };

    const handleToggleStatus = async (userId, currentStatus) => {
        try {
            await adminService.updateUserStatus(userId, !currentStatus);
            toast.success(`User ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
            loadUsers();
        } catch (error) {
            toast.error('Failed to update user status');
        }
    };

    const filteredUsers = filter === 'All'
        ? users
        : users.filter(user => user.Role === filter);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Users Management</h1>

                {/* Filter */}
                <div className="flex space-x-2">
                    {['All', 'Admin', 'Teacher', 'Student'].map((role) => (
                        <button
                            key={role}
                            onClick={() => setFilter(role)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === role
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            {role}
                        </button>
                    ))}
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                User
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Email
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Role
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Coins
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredUsers.map((user) => (
                            <tr key={user.UserID} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                                            {user.FullName?.charAt(0) || 'U'}
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-medium text-gray-900">{user.FullName}</div>
                                            <div className="text-sm text-gray-500">ID: {user.UserID}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {user.Email}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {editingUser === user.UserID ? (
                                        <div className="flex items-center space-x-2">
                                            <select
                                                value={newRole}
                                                onChange={(e) => setNewRole(e.target.value)}
                                                className="border border-gray-300 rounded px-2 py-1 text-sm"
                                            >
                                                <option value="">Select role</option>
                                                <option value="Student">Student</option>
                                                <option value="Teacher">Teacher</option>
                                                <option value="Admin">Admin</option>
                                            </select>
                                            <button
                                                onClick={() => handleUpdateRole(user.UserID)}
                                                className="text-green-600 hover:text-green-700"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setEditingUser(null)}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center space-x-2">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.Role === 'Admin' ? 'bg-red-100 text-red-800' :
                                                    user.Role === 'Teacher' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-green-100 text-green-800'
                                                }`}>
                                                {user.Role}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setEditingUser(user.UserID);
                                                    setNewRole(user.Role);
                                                }}
                                                className="text-blue-600 hover:text-blue-700"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {user.CoinBalance} coins
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.IsActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {user.IsActive ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button
                                        onClick={() => handleToggleStatus(user.UserID, user.IsActive)}
                                        className={`flex items-center space-x-1 px-3 py-1 rounded ${user.IsActive
                                                ? 'text-red-600 hover:bg-red-50'
                                                : 'text-green-600 hover:bg-green-50'
                                            }`}
                                    >
                                        {user.IsActive ? (
                                            <>
                                                <UserX className="w-4 h-4" />
                                                <span>Deactivate</span>
                                            </>
                                        ) : (
                                            <>
                                                <UserCheck className="w-4 h-4" />
                                                <span>Activate</span>
                                            </>
                                        )}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {filteredUsers.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                    No users found with filter: {filter}
                </div>
            )}
        </div>
    );
};

export default UsersManagement;
