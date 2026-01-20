import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';

const LoginPage = () => {
    const navigate = useNavigate();
    const { login, isLoading, error } = useAuthStore();
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        try {
            await login(formData.email, formData.password);
            toast.success('Login successful! Welcome back 🎉');
            setTimeout(() => navigate('/dashboard'), 500);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Login failed. Please check your credentials.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-purple-50">
            <Toaster position="top-right" />

            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[600px] animate-in fade-in zoom-in duration-300">

                {/* Left Side - Visual */}
                <div className="w-full md:w-1/2 bg-gradient-to-br from-blue-600 to-purple-600 p-12 text-white flex flex-col justify-between relative overflow-hidden">
                    <div className="relative z-10">
                        <h2 className="text-3xl font-bold mb-4">Welcome Back!</h2>
                        <p className="text-blue-100">Continue your journey to English mastery. Your AI coach is waiting.</p>
                    </div>

                    <div className="relative z-10">
                        <div className="bg-white/10 backdrop-blur-sm p-6 rounded-xl border border-white/20">
                            <p className="italic mb-4">"Language is the road map of a culture. It tells you where its people come from and where they are going."</p>
                            <p className="font-bold">- Rita Mae Brown</p>
                        </div>
                    </div>

                    {/* Decor */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-50 translate-y-1/2 -translate-x-1/2"></div>
                </div>

                {/* Right Side - Form */}
                <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
                    <div className="mb-8 text-center md:text-left">
                        <h3 className="text-2xl font-bold text-gray-900">Sign In</h3>
                        <p className="text-gray-500">Enter your email and password to access your account.</p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-6">
                        <Input
                            label="Email Address"
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="student@university.edu.vn"
                            required
                        />

                        <div>
                            <Input
                                label="Password"
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="••••••••"
                                required
                            />
                            <div className="flex justify-end mt-1">
                                <a href="#" className="text-sm text-blue-600 font-medium hover:underline">Forgot password?</a>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full shadow-lg shadow-blue-500/20 h-11"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Signing in...
                                </span>
                            ) : 'Sign In'}
                        </Button>
                    </form>

                    <p className="mt-8 text-center text-sm text-gray-600">
                        Don't have an account? {' '}
                        <Link to="/auth/register" className="text-blue-600 font-bold hover:underline">
                            Create Account
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
