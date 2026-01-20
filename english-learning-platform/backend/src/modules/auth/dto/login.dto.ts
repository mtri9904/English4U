import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
    @IsNotEmpty()
    @IsEmail()
    Email: string;

    @IsNotEmpty()
    @IsString()
    Password: string;
}
