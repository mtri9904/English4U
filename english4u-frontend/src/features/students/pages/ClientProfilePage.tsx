import { Col, Row, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { PageLoadingState, PageErrorState } from '@/components';
import {
    useChangePasswordMutation,
    useUpdateProfileMutation,
    useUserProfileQuery,
} from '@/features/students';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';
import {
    ProfileHeroHeader,
    ProfileStatCards,
    ProfileEditFormCard,
    ProfilePasswordCard,
    ProfileStreakCard,
    ProfileRecentActivitiesCard,
    type ProfileFormValues,
} from '../components/profile';

export const ClientProfilePage = () => {
    const navigate = useNavigate();
    const { data: profile, isLoading, isError, refetch } = useUserProfileQuery();
    const updateProfileMutation = useUpdateProfileMutation();
    const changePasswordMutation = useChangePasswordMutation();

    const handleUpdateProfile = async (values: ProfileFormValues) => {
        try {
            await updateProfileMutation.mutateAsync({
                displayName: values.displayName,
                avatarUrl: profile?.avatarUrl || undefined,
                phone: values.phone,
                department: profile?.department || undefined,
                position: values.position,
                notes: profile?.notes || undefined,
            });
            message.success('Đã lưu cập nhật hồ sơ.');
        } catch (error: any) {
            message.error(error?.response?.data?.message || 'Không thể cập nhật hồ sơ.');
        }
    };

    const handleAvatarUpload = async (file: File) => {
        const hide = message.loading('Đang tải ảnh đại diện...', 0);

        try {
            const avatarUrl = await uploadToCloudinary(file, 'image');
            await updateProfileMutation.mutateAsync({
                displayName: profile?.displayName || '',
                avatarUrl,
                phone: profile?.phone || undefined,
                department: profile?.department || undefined,
                position: profile?.position || undefined,
                notes: profile?.notes || undefined,
            });
            message.success('Ảnh đại diện đã được cập nhật.');
        } catch (error: any) {
            message.error(error?.message || 'Không thể tải ảnh lên.');
        } finally {
            hide();
        }

        return false;
    };

    const handleChangePassword = async (values: { oldPassword: string; newPassword: string }) => {
        try {
            await changePasswordMutation.mutateAsync(values);
            message.success('Đổi mật khẩu thành công.');
        } catch (error: any) {
            message.error(error?.response?.data?.message || 'Không thể đổi mật khẩu.');
        }
    };

    if (isLoading) {
        return <PageLoadingState type="spin" tip="Đang tải hồ sơ học viên..." />;
    }

    if (isError || !profile) {
        return (
            <div style={{ maxWidth: 600, margin: '60px auto' }}>
                <PageErrorState
                    title="Không thể tải thông tin hồ sơ"
                    onRetry={() => refetch()}
                />
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
            <ProfileHeroHeader
                profile={profile}
                onAvatarUpload={handleAvatarUpload}
                onNavigate={navigate}
            />

            <ProfileStatCards profile={profile} />

            <Row gutter={[24, 24]}>
                <Col xs={24} xl={14}>
                    <ProfileEditFormCard
                        profile={profile}
                        isUpdating={updateProfileMutation.isPending}
                        onUpdate={handleUpdateProfile}
                    />

                    <ProfilePasswordCard
                        isChanging={changePasswordMutation.isPending}
                        onChangePassword={handleChangePassword}
                    />
                </Col>

                <Col xs={24} xl={10}>
                    <ProfileStreakCard profile={profile} />

                    <ProfileRecentActivitiesCard
                        profile={profile}
                        onNavigate={navigate}
                    />
                </Col>
            </Row>
        </div>
    );
};
